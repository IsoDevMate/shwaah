import express from 'express';
import { Campaign, Post } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { createCampaignSchema, updateCampaignSchema } from '../schemas';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';

const router = express.Router();

// Create campaign
router.post('/create', authenticateUser, asyncHandler('Campaigns', 'Create')(async (req: AuthRequest, res) => {
  const validation = createCampaignSchema.safeParse(req.body);
  if (!validation.success) {
    return sendError(req, res, new Error(validation.error.errors[0].message), 'Validation failed', 400, 'VALIDATION_ERROR');
  }
  
  const { name, description, startDate, endDate } = validation.data;
  
  const campaign = await Campaign.create({
    userId: req.user!.id,
    name,
    description,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    status: 'active'
  });
  
  return sendSuccess(req, res, { campaign }, 'Campaign created successfully', 201);
}));

// Get user campaigns
router.get('/my-campaigns', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const campaigns = await Campaign.findByUser(req.user!.id);
    res.json({ campaigns });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update campaign
router.put('/:campaignId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { campaignId } = req.params;
    const { name, description, startDate, endDate, status } = req.body;
    
    const campaign = await Campaign.findById(parseInt(campaignId));
    
    if (!campaign || campaign.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const updatedCampaign = await Campaign.update(parseInt(campaignId), {
      name,
      description,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      status
    });
    
    res.json({ campaign: updatedCampaign });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete campaign
router.delete('/:campaignId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { campaignId } = req.params;
    
    const deleted = await Campaign.delete(parseInt(campaignId), req.user!.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
