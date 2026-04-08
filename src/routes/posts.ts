import express from 'express';
import { SocialAccount, Post, Analytics, Notification } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { publishToSocial, refreshTokenIfNeeded } from '../services/socialService';
import { AuthRequest, PublishResult } from '../types';
import { uploadToR2 } from '../utils/r2Storage';
import { createPostSchema } from '../schemas';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';
import { creditGuard } from '../v2/guards/creditGuard';
import { checkCredits, consumeCredits, ensureCredits } from '../v2/services/creditsService';
import { PLANS, type PlanId } from '../v2/schemas';
import { Database } from '../models';

const router = express.Router();

// Create post with multiple file uploads
router.post('/create', authenticateUser, creditGuard('publish_post'), (req, res, next) => {
  uploadToR2.array('media', 10)(req, res, (err) => {
    if (err) {
      console.error('[Posts] Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, asyncHandler('Posts', 'Create')(async (req: AuthRequest, res) => {
  console.log('[Posts] req.body:', JSON.stringify(req.body));
  console.log('[Posts] req.files:', req.files?.length ?? 0, 'files');
  const validation = createPostSchema.safeParse(req.body);
  if (!validation.success) {
    const errorMessage = validation.error.issues[0]?.message || 'Validation failed';
    return sendError(req, res, new Error(errorMessage), errorMessage, 400, 'VALIDATION_ERROR');
  }
  
  const { content, platforms, scheduledAt, campaignId, platformContent } = validation.data;
  const files = req.files as (Express.MulterS3.File | Express.Multer.File)[];

  const mediaUrls = files?.map(file => {
    const s3File = file as Express.MulterS3.File;
    if (process.env.R2_PUBLIC_URL && s3File.key) return `${process.env.R2_PUBLIC_URL}/${s3File.key}`;
    if (s3File.location) return s3File.location;
    return null;
  }).filter(Boolean) as string[] || [];
  
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

  if (scheduledAt) {
    const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000);
    if (new Date(scheduledAt) < minScheduleTime) {
      return sendError(req, res, new Error('Schedule time must be at least 5 minutes from now'), 'Schedule time must be at least 5 minutes from now', 400, 'INVALID_SCHEDULE_TIME');
    }

    // Enforce free plan scheduled post limit
    const credits = await ensureCredits(req.user!.id);
    const plan = credits.plan as PlanId;
    const maxScheduled = PLANS[plan].features.maxScheduledPosts;
    if (maxScheduled !== 999999) {
      const scheduledCount = await Database.execute(
        "SELECT COUNT(*) as count FROM Posts WHERE userId = ? AND status = 'scheduled'",
        [req.user!.id]
      );
      const count = Number(scheduledCount.rows[0]?.count ?? 0);
      if (count >= maxScheduled) {
        return sendError(req, res, new Error(`Your ${plan} plan allows a maximum of ${maxScheduled} scheduled post${maxScheduled > 1 ? 's' : ''}. Upgrade to schedule more.`), 'Schedule limit reached', 402, 'SCHEDULE_LIMIT_REACHED');
      }
    }
  }
  
  const post = await Post.create({
    userId: req.user!.id,
    content,
    mediaUrls,
    platforms,
    platformContent: platformContent ?? null,
    status,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    campaignId: campaignId || null
  });
  
  console.log(`[Posts] Created post ${post.id} with status: ${status}${scheduledAt ? ` for ${scheduledAt}` : ''}`);

  // Only deduct credits for immediate posts — scheduled posts deduct when they actually publish
  if (status !== 'scheduled' && (req as any).consumeCredits) {
    await (req as any).consumeCredits(platforms.join(', '));
  }
  
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
        
        // Use per-platform content override if available
        const platformOverride = post.platformContent?.[account.platform];
        const postContent = platformOverride?.content
          ? `${platformOverride.content}${platformOverride.hashtags ? '\n' + platformOverride.hashtags : ''}`
          : post.content;

        console.log(`[Publish] ${account.platform} - Media URL:`, mediaUrl);
        
        // Publish to platform
        const result = await publishToSocial(
          account.platform, 
          refreshedAccount.accessToken, 
          postContent, 
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

    // Create Analytics rows and notification for successful platforms
    await Promise.all(
      Object.entries(publishResults)
        .filter(([, r]) => (r as any).success)
        .map(([platform]) => Analytics.create({ postId, platform, views: 0, likes: 0, shares: 0, comments: 0, engagementRate: 0 }))
    );

    const platforms = post.platforms.join(', ');
    const preview = post.content.substring(0, 60);
    if (status === 'published') {
      await Notification.create({ userId: req.user!.id, type: 'success', title: 'Post Published', message: `"${preview}..." published to ${platforms}.`, postId });
    } else if (status === 'partial') {
      const failed = Object.entries(publishResults).filter(([, r]) => !(r as any).success).map(([k]) => k).join(', ');
      await Notification.create({ userId: req.user!.id, type: 'warning', title: 'Post Partially Published', message: `Failed on: ${failed}.`, postId });
    } else {
      await Notification.create({ userId: req.user!.id, type: 'error', title: 'Post Failed', message: `Failed to publish "${preview}...".`, postId });
    }
    
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
    if (!deleted) return res.status(404).json({ error: 'Post not found' });
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Reschedule a post (drag-drop)
router.patch('/:postId/reschedule', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    const { scheduledAt } = req.body;
    if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt required' });

    const post = await Post.findById(postId);
    if (!post || post.userId !== req.user!.id) return res.status(404).json({ error: 'Post not found' });
    if (post.status === 'published') return res.status(400).json({ error: 'Cannot reschedule a published post' });

    await Post.update(postId, {
      ...post,
      scheduledAt: new Date(scheduledAt).toISOString(),
      status: 'scheduled'
    });
    res.json({ success: true, scheduledAt });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
