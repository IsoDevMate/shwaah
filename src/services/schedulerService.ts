import cron from 'node-cron';
import { Post, SocialAccount, Analytics } from '../models/tursoModels';
import { publishToSocial, refreshTokenIfNeeded } from './socialService';

// Schedule posts every minute
cron.schedule('* * * * *', async () => {
  try {
    const scheduledPosts = await Post.findScheduled();
    
    for (const post of scheduledPosts) {
      await publishScheduledPost(post);
    }
  } catch (error) {
    console.error('Scheduler error:', error);
  }
});

async function publishScheduledPost(post: any) {
  try {
    // Get connected accounts for platforms
    const connectedAccounts = await SocialAccount.findByUserAndPlatforms(post.userId, post.platforms);

    const publishResults: Record<string, any> = {};
    
    for (const account of connectedAccounts) {
      try {
        const refreshedAccount = await refreshTokenIfNeeded(account);
        const result = await publishToSocial(
          account.platform as string, 
          refreshedAccount.accessToken, 
          post.content, 
          post.mediaUrls?.[0] // Use first media URL
        );
        
        publishResults[account.platform as string] = { success: true, data: result };
        
        // Create analytics record
        await Analytics.create({
          postId: post.id,
          platform: account.platform as string,
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
          engagementRate: 0
        });
        
      } catch (error) {
        publishResults[account.platform as string] = { 
          success: false, 
          error: (error as Error).message 
        };
      }
    }

    // Update post status
    const hasFailures = Object.values(publishResults).some((result: any) => !result.success);
    await Post.update(post.id, {
      status: hasFailures ? 'failed' : 'published',
      publishResults
    });

    console.log(`Published scheduled post ${post.id}`);
  } catch (error) {
    console.error(`Failed to publish scheduled post ${post.id}:`, error);
  }
}

// Fetch analytics data every hour
cron.schedule('0 * * * *', async () => {
  try {
    await updateAnalytics();
  } catch (error) {
    console.error('Analytics update error:', error);
  }
});

async function updateAnalytics() {
  // This would fetch real metrics from platform APIs
  // For now, simulate with random data
  const recentAnalytics = await Analytics.findRecent(1); // Last 24 hours
  
  for (const analytics of recentAnalytics) {
    await Analytics.update(analytics.id as number, {
      views: Number(analytics.views || 0) + Math.floor(Math.random() * 100),
      likes: Number(analytics.likes || 0) + Math.floor(Math.random() * 20),
      shares: Number(analytics.shares || 0) + Math.floor(Math.random() * 5),
      comments: Number(analytics.comments || 0) + Math.floor(Math.random() * 10),
      engagementRate: Math.random() * 10
    });
  }
}

export { publishScheduledPost, updateAnalytics };
