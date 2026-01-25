import express from 'express';
import { SocialAccount, Post } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { publishToSocial, refreshTokenIfNeeded } from '../services/socialService';
import { AuthRequest, PublishResult } from '../types';
import { uploadToR2 } from '../utils/r2Storage';

const router = express.Router();

// Create post with multiple file uploads
router.post('/create', authenticateUser, uploadToR2.array('media', 10), async (req: AuthRequest, res) => {
  try {
    const { content, platforms, scheduledAt, campaignId } = req.body;
    const selectedPlatforms = JSON.parse(platforms);
    const files = req.files as Express.MulterS3.File[];
    
    // Get media URLs from uploaded files
    const mediaUrls = files?.map(file => file.location) || [];
    
    // Validate platforms
    const validPlatforms = ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'];
    const invalidPlatforms = selectedPlatforms.filter((p: string) => !validPlatforms.includes(p));
    
    if (invalidPlatforms.length > 0) {
      return res.status(400).json({ 
        error: `Invalid platforms: ${invalidPlatforms.join(', ')}` 
      });
    }
    
    // Check if user has connected all selected platforms
    const connectedAccounts = await SocialAccount.findByUserAndPlatforms(req.user!.id, selectedPlatforms);
    
    const connectedPlatforms = connectedAccounts.map((acc: any) => acc.platform);
    const missingPlatforms = selectedPlatforms.filter((p: string) => !connectedPlatforms.includes(p));
    
    if (missingPlatforms.length > 0) {
      return res.status(400).json({ 
        error: `Please connect these platforms first: ${missingPlatforms.join(', ')}` 
      });
    }
    
    // Determine status based on scheduling
    const status = scheduledAt ? 'scheduled' : 'pending';
    
    // Create post record
    const post = await Post.create({
      userId: req.user!.id,
      content,
      mediaUrls,
      platforms: selectedPlatforms,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      campaignId: campaignId || undefined
    });
    
    res.json({ 
      message: `Post ${status === 'scheduled' ? 'scheduled' : 'created'} successfully`, 
      postId: post.id,
      post: {
        id: post.id,
        content: post.content,
        mediaUrls: post.mediaUrls,
        platforms: post.platforms,
        status: post.status,
        scheduledAt: post.scheduledAt,
        campaignId: post.campaignId
      }
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Publish post
router.post('/publish/:postId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(parseInt(postId));
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Post already published' });
    }
    
    // Get connected accounts for selected platforms
    const connectedAccounts = await SocialAccount.findByUserAndPlatforms(req.user!.id, post.platforms);
    
    const publishResults: Record<string, PublishResult> = {};
    const publishPromises = connectedAccounts.map(async (account: any) => {
      try {
        // Refresh token if needed
        const refreshedAccount = await refreshTokenIfNeeded(account);
        
        // Publish to platform
        const result = await publishToSocial(
          account.platform, 
          refreshedAccount.accessToken, 
          post.content, 
          post.mediaUrls?.[0] // Use first media URL for now
        );
        
        publishResults[account.platform] = {
          success: true,
          data: result
        };
      } catch (error) {
        publishResults[account.platform] = {
          success: false,
          error: (error as Error).message
        };
      }
    });
    
    await Promise.all(publishPromises);
    
    // Update post status
    const hasFailures = Object.values(publishResults).some(result => !result.success);
    const status = hasFailures ? 'failed' : 'published';
    
    await Post.update(parseInt(postId), {
      status,
      publishResults
    });
    
    res.json({ 
      message: `Post ${status} successfully`,
      results: publishResults 
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get user posts
router.get('/my-posts', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const posts = await Post.findByUser(req.user!.id);
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get scheduled posts
router.get('/scheduled', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const scheduledPosts = await Post.findScheduledByUser(req.user!.id);
    res.json({ scheduledPosts });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get calendar view
router.get('/calendar', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { month, year } = req.query;
    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
      const posts = await Post.findByDateRange(req.user!.id, startDate, endDate);
      res.json({ posts });
    } else {
      const posts = await Post.findByUser(req.user!.id);
      const scheduledPosts = posts.filter((post: any) => post.status === 'scheduled');
      res.json({ posts: scheduledPosts });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Delete post
router.delete('/:postId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    
    const deleted = await Post.delete(parseInt(postId), req.user!.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
