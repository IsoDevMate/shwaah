import express from 'express';
import { Analytics, Post, Campaign } from '../models/tursoModels';
import { Database } from '../models';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = express.Router();

// Get post analytics
router.get('/post/:postId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(parseInt(postId));
    if (!post || post.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const analytics = await Analytics.findByPost(parseInt(postId));
    
    res.json({ 
      analytics,
      post: {
        content: post.content,
        platforms: post.platforms
      }
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get campaign analytics
router.get('/campaign/:campaignId', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { campaignId } = req.params;
    
    const campaign = await Campaign.findById(parseInt(campaignId));
    if (!campaign || campaign.userId !== req.user!.id) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    const analytics = await Analytics.findByCampaign(parseInt(campaignId));
    
    // Aggregate metrics
    const totalViews = analytics.reduce((sum: number, a: any) => sum + a.views, 0);
    const totalLikes = analytics.reduce((sum: number, a: any) => sum + a.likes, 0);
    const totalShares = analytics.reduce((sum: number, a: any) => sum + a.shares, 0);
    const totalComments = analytics.reduce((sum: number, a: any) => sum + a.comments, 0);
    const avgEngagement = analytics.length > 0 ? 
      analytics.reduce((sum: number, a: any) => sum + a.engagementRate, 0) / analytics.length : 0;
    
    res.json({ 
      analytics,
      summary: {
        totalViews,
        totalLikes,
        totalShares,
        totalComments,
        avgEngagement
      }
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get user dashboard analytics
router.get('/dashboard', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { period = '30' } = req.query;
    const daysAgo = parseInt(period as string);
    
    const analytics = await Analytics.findByUserAndDateRange(req.user!.id, daysAgo);
    
    // Platform breakdown
    const platformMetrics = analytics.reduce((acc: any, a: any) => {
      if (!acc[a.platform]) {
        acc[a.platform] = { views: 0, likes: 0, shares: 0, comments: 0, posts: 0 };
      }
      acc[a.platform].views += a.views;
      acc[a.platform].likes += a.likes;
      acc[a.platform].shares += a.shares;
      acc[a.platform].comments += a.comments;
      acc[a.platform].posts += 1;
      return acc;
    }, {});
    
    const totalMetrics = {
      totalViews: analytics.reduce((sum: number, a: any) => sum + a.views, 0),
      totalLikes: analytics.reduce((sum: number, a: any) => sum + a.likes, 0),
      totalShares: analytics.reduce((sum: number, a: any) => sum + a.shares, 0),
      totalComments: analytics.reduce((sum: number, a: any) => sum + a.comments, 0),
      totalPosts: new Set(analytics.map((a: any) => a.postId)).size,
      avgEngagement: analytics.length > 0 ? 
        analytics.reduce((sum: number, a: any) => sum + a.engagementRate, 0) / analytics.length : 0
    };
    
    res.json({ 
      totalMetrics,
      platformMetrics,
      period: daysAgo
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Super user analytics (admin only)
router.get('/admin/overview', authenticateUser, async (req: AuthRequest, res) => {
  try {
    // Get counts
    const totalUsersResult = await Database.execute('SELECT COUNT(*) as count FROM Users');
    const totalPostsResult = await Database.execute('SELECT COUNT(*) as count FROM Posts');
    const totalCampaignsResult = await Database.execute('SELECT COUNT(*) as count FROM Campaigns');
    
    const totalUsers = totalUsersResult.rows[0].count;
    const totalPosts = totalPostsResult.rows[0].count;
    const totalCampaigns = totalCampaignsResult.rows[0].count;
    
    const recentAnalytics = await Analytics.findRecent(7);
    
    const platformStats = recentAnalytics.reduce((acc: any, a: any) => {
      if (!acc[a.platform]) {
        acc[a.platform] = { views: 0, engagement: 0, posts: 0 };
      }
      acc[a.platform].views += a.views;
      acc[a.platform].engagement += a.engagementRate;
      acc[a.platform].posts += 1;
      return acc;
    }, {});
    
    res.json({
      overview: {
        totalUsers,
        totalPosts,
        totalCampaigns,
        totalViews: recentAnalytics.reduce((sum: number, a: any) => sum + a.views, 0)
      },
      platformStats
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
