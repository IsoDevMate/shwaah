import { z } from 'zod';

export const createPostSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000, 'Content too long'),
  platforms: z.string().transform((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error('Invalid platforms format');
    }
  }).pipe(z.array(z.enum(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'])).min(1, 'At least one platform required')),
  scheduledAt: z.string().datetime().optional().refine((date) => {
    if (!date) return true;
    const scheduledDate = new Date(date);
    if (isNaN(scheduledDate.getTime())) return false;
    const bufferMinutes = parseInt(process.env.SCHEDULE_BUFFER_MINUTES ?? '5', 10);
    return scheduledDate >= new Date(Date.now() + bufferMinutes * 60 * 1000);
  }, { message: 'Scheduled time must be at least 5 minutes from now' }).transform((date) => date && date.trim() !== '' ? date : undefined),
  campaignId: z.string().uuid().optional()
});

export type CreatePostInput = z.infer<typeof createPostSchema>;