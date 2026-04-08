import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createSlideshow } from './toolsService';

const redisUrl = process.env.REDIS_URL!;
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  ...(redisUrl.startsWith('rediss://') && { tls: {} }),
});

export const slideshowQueue = new Queue('slideshow', { connection });

const jobResults = new Map<string, { status: 'processing' | 'done' | 'failed'; url?: string; error?: string }>();

new Worker('slideshow', async (job: Job) => {
  const { imageUrls, captions, transition, userId } = job.data;
  jobResults.set(job.id!, { status: 'processing' });
  try {
    const url = await createSlideshow(imageUrls, captions, transition, userId);
    jobResults.set(job.id!, { status: 'done', url });
  } catch (err: any) {
    jobResults.set(job.id!, { status: 'failed', error: err.message });
    throw err;
  }
}, { connection });

export function getSlideshowResult(jobId: string) {
  return jobResults.get(jobId) ?? null;
}
