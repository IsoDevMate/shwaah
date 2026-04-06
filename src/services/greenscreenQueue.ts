import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { createGreenscreenMeme } from './toolsService';

const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

export const greenscreenQueue = new Queue('greenscreen', { connection });

// In-memory job results (keyed by jobId)
const jobResults = new Map<string, { status: 'processing' | 'done' | 'failed'; url?: string; error?: string }>();

new Worker('greenscreen', async (job: Job) => {
  const { videoUrl, backgroundUrl, caption, userId } = job.data;
  jobResults.set(job.id!, { status: 'processing' });
  try {
    const url = await createGreenscreenMeme(videoUrl, backgroundUrl, caption, userId);
    jobResults.set(job.id!, { status: 'done', url });
  } catch (err: any) {
    jobResults.set(job.id!, { status: 'failed', error: err.message });
    throw err;
  }
}, { connection });

export function getJobResult(jobId: string) {
  return jobResults.get(jobId) ?? null;
}
