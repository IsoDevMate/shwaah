import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { v4 as uuidv4 } from 'uuid';

const endpoint = process.env.R2_ENDPOINT?.replace('/marketingaddons', '');
console.log('[R2] Endpoint:', endpoint ?? 'MISSING - using memoryStorage');
console.log('[R2] Bucket:', process.env.R2_BUCKET_NAME ?? 'MISSING');

export const s3Client: S3Client | null = endpoint
  ? new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
      }
    })
  : null;

export const uploadToR2 = multer({
  storage: s3Client && process.env.R2_BUCKET_NAME
    ? multerS3({
        s3: s3Client,
        bucket: process.env.R2_BUCKET_NAME,
        key: (req, file, cb) => {
          cb(null, `${Date.now()}-${uuidv4()}-${file.originalname}`);
        },
        contentType: multerS3.AUTO_CONTENT_TYPE
      })
    : multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

export const uploadFileToR2 = async (file: Buffer, fileName: string, contentType: string): Promise<string> => {
  if (!s3Client) throw new Error('R2 not configured');
  const key = `${Date.now()}-${uuidv4()}-${fileName}`;
  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: file,
    ContentType: contentType
  }));
  return `${process.env.R2_ENDPOINT}/${key}`;
};

export const deleteFileFromR2 = async (fileUrl: string): Promise<void> => {
  if (!s3Client) return;
  const key = fileUrl.split('/').pop();
  if (!key) return;
  await s3Client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key
  }));
};

export const getSignedUrlForFile = async (fileUrl: string): Promise<string> => {
  if (!s3Client) throw new Error('R2 not configured');
  const key = fileUrl.split('/').pop();
  if (!key) throw new Error('Invalid file URL - no key found');
  const signedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: decodeURIComponent(key)
  }), { expiresIn: 3600 });
  return signedUrl;
};
