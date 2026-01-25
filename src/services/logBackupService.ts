import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!.replace('/marketingaddons', ''),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
  }
});

const LOGS_DIR = path.join(process.cwd(), 'logs');
const BUCKET = process.env.R2_BUCKET_NAME!;
const LOG_RETENTION_DAYS = 7;

// Upload log file to R2
async function uploadLogToR2(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const timestamp = new Date().toISOString().split('T')[0];
  const key = `logs/${timestamp}/${fileName}`;
  
  const fileContent = fs.readFileSync(filePath);
  
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileContent,
    ContentType: 'text/plain'
  }));
  
  console.log(`📤 Log uploaded: ${key}`);
}

// Delete old logs from R2
async function deleteOldLogs(): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - LOG_RETENTION_DAYS);
  
  const listResponse = await s3Client.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: 'logs/'
  }));
  
  if (!listResponse.Contents) return;
  
  for (const object of listResponse.Contents) {
    if (object.LastModified && object.LastModified < cutoffDate) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: object.Key!
      }));
      console.log(`🗑️  Deleted old log: ${object.Key}`);
    }
  }
}

// Backup and rotate logs
async function backupLogs(): Promise<void> {
  try {
    if (!fs.existsSync(LOGS_DIR)) return;
    
    const logFiles = fs.readdirSync(LOGS_DIR).filter(file => file.endsWith('.log'));
    
    for (const file of logFiles) {
      const filePath = path.join(LOGS_DIR, file);
      await uploadLogToR2(filePath);
    }
    
    // Delete old logs from R2
    await deleteOldLogs();
    
    // Clear local log files after backup
    for (const file of logFiles) {
      const filePath = path.join(LOGS_DIR, file);
      fs.writeFileSync(filePath, ''); // Clear content but keep file
    }
    
    console.log('✅ Log backup completed');
  } catch (error) {
    console.error('❌ Log backup failed:', error.message);
  }
}

// Schedule daily backup at 2 AM
cron.schedule('0 2 * * *', backupLogs);

// Backup on server shutdown
process.on('SIGTERM', async () => {
  console.log('📤 Backing up logs before shutdown...');
  await backupLogs();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📤 Backing up logs before shutdown...');
  await backupLogs();
  process.exit(0);
});

export { backupLogs };
