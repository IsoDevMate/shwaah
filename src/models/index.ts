import { createClient } from '@libsql/client';

// Direct Turso client
export const db = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Generate UUID v4
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Test connection first
export const testConnection = async () => {
  try {
    console.log('🔍 Testing Turso connection...');
    console.log('Database URL:', process.env.DATABASE_URL);
    console.log('Token length:', process.env.TURSO_AUTH_TOKEN?.length);
    
    const result = await db.execute('SELECT 1 as test');
    console.log('✅ Connection test successful:', result.rows);
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
};

// Database operations
export class Database {
  static async execute(sql: string, params: any[] = []) {
    try {
      const result = await db.execute({ sql, args: params });
      return result;
    } catch (error) {
      console.error('Database error:', error);
      console.error('SQL:', sql);
      console.error('Stack:', (error as Error).stack);
      throw error;
    }
  }

  static async init() {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Failed to connect to Turso database');
    }
    
    console.log('🔨 Creating tables if they don\'t exist...');
    
    // Create tables with UUID primary keys (only if they don't exist)
    await this.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS SocialAccounts (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        platform TEXT NOT NULL,
        platformUserId TEXT NOT NULL,
        platformUsername TEXT,
        accessToken TEXT NOT NULL,
        refreshToken TEXT,
        expiresAt DATETIME,
        isActive BOOLEAN DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Posts (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        content TEXT NOT NULL,
        mediaUrls TEXT,
        platforms TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        publishResults TEXT,
        scheduledAt DATETIME,
        campaignId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Campaigns (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        startDate DATETIME NOT NULL,
        endDate DATETIME NOT NULL,
        status TEXT DEFAULT 'active',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Analytics (
        id TEXT PRIMARY KEY,
        postId TEXT NOT NULL,
        platform TEXT NOT NULL,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        engagementRate REAL DEFAULT 0,
        recordedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (postId) REFERENCES Posts(id)
      )
    `);

    await this.execute(`
      CREATE TABLE IF NOT EXISTS Notifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        postId TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES Users(id)
      )
    `);

    console.log('✅ Database tables initialized with UUID schema');
    
    // Test R2 storage connection
    await this.testR2Connection();
  }

  static async testR2Connection() {
    try {
      console.log('🔄 Testing Cloudflare R2 connection...');
      
      const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      
      const s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT!.replace('/marketingaddons', ''),
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
        }
      });

      const listCommand = new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME!,
        MaxKeys: 1
      });
      
      await s3Client.send(listCommand);
      console.log('✅ R2 storage connection successful');
      console.log(`📁 Bucket: ${process.env.R2_BUCKET_NAME}`);
      
    } catch (error) {
      console.error('❌ R2 connection failed:', (error as Error).message);
      console.log('💡 Media uploads will not work until R2 is configured');
    }
  }
}