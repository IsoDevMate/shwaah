import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';

// Configure S3 client for Cloudflare R2
const endpoint = process.env.R2_ENDPOINT?.replace('/marketingaddons', '');

export const s3Client = endpoint
  ? new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
      }
    })
  : null;

// Multer configuration for R2 upload
export const uploadToR2 = multer({
  storage: s3Client
    ? multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME!,
        key: (req, file, cb) => {
          const fileName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
          cb(null, fileName);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE
      })
    : multer.memoryStorage(),
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
  try {
    console.log('[R2] Getting signed URL for:', fileUrl);
    const key = fileUrl.split('/').pop();
    if (!key) throw new Error('Invalid file URL - no key found');
    
    console.log('[R2] Extracted key:', key);
    
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: decodeURIComponent(key) // Decode URL-encoded characters
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log('[R2] Generated signed URL successfully');
    return signedUrl;
  } catch (error) {
    console.error('[R2] Error generating signed URL:', error);
    throw error;
  }
};

export { s3Client };
