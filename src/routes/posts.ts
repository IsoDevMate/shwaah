import express from 'express';
import { SocialAccount, Post } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { publishToSocial, refreshTokenIfNeeded } from '../services/socialService';
import { AuthRequest, PublishResult } from '../types';
import { uploadToR2 } from '../utils/r2Storage';
import { createPostSchema } from '../schemas';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';

const router = express.Router();

// Create post with multiple file uploads
router.post('/create', authenticateUser, uploadToR2.array('media', 10), asyncHandler('Posts', 'Create')(async (req: AuthRequest, res) => {
  const validation = createPostSchema.safeParse(req.body);
  if (!validation.success) {
    const errorMessage = validation.error.issues[0]?.message || 'Validation failed';
    return sendError(req, res, new Error(errorMessage), errorMessage, 400, 'VALIDATION_ERROR');
  }
  
  const { content, platforms, scheduledAt, campaignId } = validation.data;
  const files = req.files as Express.MulterS3.File[];
  
  // Convert R2 URLs to public URLs if R2_PUBLIC_URL is set
  const mediaUrls = files?.map(file => {
    if (process.env.R2_PUBLIC_URL && file.key) {
      return `${process.env.R2_PUBLIC_URL}/${file.key}`;
    }
    return file.location;
  }) || [];
  
  const connectedAccounts = await SocialAccount.findByUserAndPlatforms(req.user!.id, platforms);
  
  const connectedPlatforms = connectedAccounts.map((acc: any) => acc.platform);
  const missingPlatforms = platforms.filter((p: string) => !connectedPlatforms.includes(p));
  
  if (missingPlatforms.length > 0) {
    return sendError(
      req, 
      res, 
      new Error(`Please connect these platforms first: ${missingPlatforms.join(', ')}`), 
      `Missing platforms: ${missingPlatforms.join(', ')}`, 
      400, 
      'MISSING_PLATFORMS'
    );
  }
  
  const status = scheduledAt ? 'scheduled' : 'pending';
  
  const post = await Post.create({
    userId: req.user!.id,
    content,
    mediaUrls,
    platforms,
    status,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    campaignId: campaignId || null
  });
  
  console.log(`[Posts] Created post ${post.id} with status: ${status}${scheduledAt ? ` for ${scheduledAt}` : ''}`);
  
  return sendSuccess(req, res, {
    postId: post.id,
    post: {
      id: post.id,
      content: post.content,
      mediaUrls: post.mediaUrls,
      platforms: post.platforms,
      status: post.status,
      scheduledAt: post.scheduledAt,
      campaignId: post.campaignId
    },
    message: status === 'scheduled' 
      ? `Post scheduled for ${new Date(scheduledAt!).toLocaleString()}`
      : 'Post created successfully'
  }, `Post ${status === 'scheduled' ? 'scheduled' : 'created'} successfully`, 201);
}));

// Publish post
router.post('/publish/:postId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    
    console.log(`[Publish] Starting publish for post ${postId}`);
    
    const post = await Post.findById(postId);
    
    if (!post) {
      console.error(`[Publish] Post not found: ${postId}`);
      return res.status(404).json({ error: 'Post not found' });
    }
    
    console.log('[Publish] Post data:', {
      id: post.id,
      platforms: post.platforms,
      mediaUrls: post.mediaUrls,
      status: post.status
    });
    
    if (post.status === 'published') {
      return res.status(400).json({ error: 'Post already published' });
    }
    
    // Get connected accounts for selected platforms
    const connectedAccounts = await SocialAccount.findByUserAndPlatforms(req.user!.id, post.platforms);
    
    console.log(`[Publish] Found ${connectedAccounts.length} connected accounts`);
    
    const publishResults: Record<string, PublishResult> = {};
    const publishPromises = connectedAccounts.map(async (account: any) => {
      try {
        console.log(`[Publish] Publishing to ${account.platform}...`);
        
        // Refresh token if needed
        const refreshedAccount = await refreshTokenIfNeeded(account);
        
        // Get the first media URL (or undefined if no media)
        const mediaUrl = post.mediaUrls && post.mediaUrls.length > 0 ? post.mediaUrls[0] : undefined;
        const mediaUrls = post.mediaUrls || [];
        
        console.log(`[Publish] ${account.platform} - Media URL:`, mediaUrl);
        
        // Publish to platform
        const result = await publishToSocial(
          account.platform, 
          refreshedAccount.accessToken, 
          post.content, 
          mediaUrl,
          mediaUrls
        );
        
        publishResults[account.platform] = {
          success: true,
          data: result
        };
        
        console.log(`[Publish] ${account.platform} - Success`);
      } catch (error: any) {
        console.error(`[Publish] ${account.platform} - Error:`, error.message);
        publishResults[account.platform] = {
          success: false,
          error: error.message
        };
      }
    });
    
    await Promise.all(publishPromises);
    
    // Update post status
    const hasFailures = Object.values(publishResults).some(result => !result.success);
    const allFailed = Object.values(publishResults).every(result => !result.success);
    const status = allFailed ? 'failed' : hasFailures ? 'partial' : 'published';
    
    console.log(`[Publish] Final status: ${status}`);
    console.log(`[Publish] Results:`, publishResults);
    
    await Post.update(postId, {
      status,
      publishResults
    });
    
    const message = allFailed 
      ? 'Post failed to publish on all platforms' 
      : hasFailures 
        ? 'Post published partially - some platforms failed'
        : 'Post published successfully';
    
    res.json({ 
      message,
      results: publishResults 
    });
  } catch (error) {
    console.error('[Publish] Unhandled error:', error);
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
    
    const deleted = await Post.delete(postId, req.user!.id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
