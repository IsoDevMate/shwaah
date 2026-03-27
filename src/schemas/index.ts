import { z } from 'zod';

// Posts schemas
export * from './posts';

// Campaigns schemas
export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date')
}).refine((data) => new Date(data.endDate) > new Date(data.startDate), {
  message: 'End date must be after start date',
  path: ['endDate']
}).refine((data) => new Date(data.startDate) > new Date(), {
  message: 'Start date must be in the future',
  path: ['startDate']
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(100, 'Name too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
  startDate: z.string().datetime('Invalid start date').optional(),
  endDate: z.string().datetime('Invalid end date').optional()
}).refine((data) => {
  if (data.startDate) {
    return new Date(data.startDate) > new Date();
  }
  return true;
}, {
  message: 'Start date must be in the future',
  path: ['startDate']
});

// Social schemas
export const connectSocialSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'])
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type ConnectSocialInput = z.infer<typeof connectSocialSchema>;
