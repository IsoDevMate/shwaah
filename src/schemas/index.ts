import { z } from 'zod';

// Posts schemas
export const createPostSchema = z.object({
  content: z.string().min(1, 'Content is required').max(2000, 'Content too long'),
  platforms: z.string().transform((val) => {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      throw new Error('Invalid platforms format');
    }
  }).pipe(z.array(z.enum(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'])).min(1, 'At least one platform required')),
  scheduledAt: z.string().datetime().optional(),
  campaignId: z.string().uuid().optional()
});

// Campaigns schemas
export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date')
}).refine((data) => new Date(data.endDate) > new Date(data.startDate), {
  message: 'End date must be after start date',
  path: ['endDate']
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100, 'Name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  startDate: z.string().datetime('Invalid start date').optional(),
  endDate: z.string().datetime('Invalid end date').optional()
});

// Social schemas
export const connectSocialSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'])
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type ConnectSocialInput = z.infer<typeof connectSocialSchema>;
