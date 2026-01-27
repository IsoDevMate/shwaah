import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!.replace('/marketingaddons', ''),
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
  }
});

// Multer configuration for R2 upload
export const uploadToR2 = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.R2_BUCKET_NAME!,
    key: (req, file, cb) => {
      const fileName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE
  }),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Direct upload function
export const uploadFileToR2 = async (file: Buffer, fileName: string, contentType: string): Promise<string> => {
  const key = `${Date.now()}-${uuidv4()}-${fileName}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType
  });
  
  await s3Client.send(command);
  return `${process.env.R2_ENDPOINT}/${key}`;
};

// Delete file from R2
export const deleteFileFromR2 = async (fileUrl: string): Promise<void> => {
  const key = fileUrl.split('/').pop();
  if (!key) return;
  
  const command = new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key
  });
  
  await s3Client.send(command);
};

// Generate signed URL for private access
export const getSignedUrlForFile = async (fileUrl: string): Promise<string> => {
  const key = fileUrl.split('/').pop();
  if (!key) throw new Error('Invalid file URL');
  
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key
  });
  
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
};

export { s3Client };
