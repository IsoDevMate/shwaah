import cron from 'node-cron';
import axios from 'axios';
import { Post, SocialAccount, Analytics, Notification } from '../models/tursoModels';
import { publishToSocial, refreshTokenIfNeeded } from './socialService';

let isSchedulerRunning = false;
let lastRunTime: Date | null = null;
let schedulerStats = {
  totalRuns: 0,
  successfulPosts: 0,
  failedPosts: 0,
  errors: 0
};

const postScheduler = cron.schedule('* * * * *', async () => {
  if (isSchedulerRunning) {
    console.log('[Scheduler] Previous run still in progress, skipping...');
    return;
  }

  try {
    isSchedulerRunning = true;
    lastRunTime = new Date();
    schedulerStats.totalRuns++;
    
    const now = new Date();
    console.log(`[Scheduler] Running at ${now.toISOString()}`);

    // Posts due now (already past their scheduled time)
    const duePosts = await Post.findScheduled(0);
    // Debug: show next upcoming post
    const upcomingPosts = await Post.findScheduled(60);
    const soonPosts = upcomingPosts.filter(p => !duePosts.find(d => d.id === p.id));
    if (soonPosts.length > 0) {
      console.log(`[Scheduler] Next scheduled: ${soonPosts[0].scheduledAt} (UTC now: ${now.toISOString()})`);
    }

    console.log(`[Scheduler] Found ${duePosts.length} posts to publish`);

    for (const post of duePosts) {
      await publishScheduledPost(post);
    }
    
    console.log(`[Scheduler] Completed run. Stats:`, schedulerStats);
  } catch (error) {
    console.error('[Scheduler] Critical error:', error);
    schedulerStats.errors++;
  } finally {
    isSchedulerRunning = false;
  }
}, {
  scheduled: true,
  timezone: "UTC"
});

async function publishScheduledPost(post: any) {
  try {
    console.log(`[Scheduler] Processing post ${post.id}`);
    
    if (!post.scheduledAt) {
      console.warn(`[Scheduler] Post ${post.id} has null scheduledAt, marking as failed`);
      await Post.update(post.id, {
        status: 'failed',
        publishResults: { error: 'Invalid schedule time' }
      });
      schedulerStats.failedPosts++;
      return;
    }

    const scheduleTime = new Date(post.scheduledAt);
    if (isNaN(scheduleTime.getTime())) {
      console.error(`[Scheduler] Post ${post.id} has invalid scheduledAt: ${post.scheduledAt}`);
      await Post.update(post.id, {
        status: 'failed',
        publishResults: { error: 'Invalid date format' }
      });
      schedulerStats.failedPosts++;
      return;
    }

    const now = new Date();
    const timeDiff = now.getTime() - scheduleTime.getTime();
    const fiveMinutesInMs = 5 * 60 * 1000;
    
    if (scheduleTime > now) {
      console.log(`[Scheduler] Post ${post.id} is scheduled for future: ${post.scheduledAt}, skipping`);
      return;
    }
    
    if (timeDiff > fiveMinutesInMs) {
      console.warn(`[Scheduler] Post ${post.id} is ${Math.round(timeDiff / 60000)} minutes late, still publishing...`);
    }

    if (!post.platforms || !Array.isArray(post.platforms) || post.platforms.length === 0) {
      console.error(`[Scheduler] Post ${post.id} has no platforms`);
      await Post.update(post.id, {
        status: 'failed',
        publishResults: { error: 'No platforms specified' }
      });
      schedulerStats.failedPosts++;
      return;
    }

    const connectedAccounts = await SocialAccount.findByUserAndPlatforms(post.userId, post.platforms);

    if (connectedAccounts.length === 0) {
      console.error(`[Scheduler] Post ${post.id} has no connected accounts for platforms: ${post.platforms.join(', ')}`);
      await Post.update(post.id, {
        status: 'failed',
        publishResults: { error: 'No connected accounts found for selected platforms' }
      });
      schedulerStats.failedPosts++;
      return;
    }

    console.log(`[Scheduler] Publishing post ${post.id} to ${connectedAccounts.length} platforms`);
    
    const publishResults: Record<string, any> = {};
    let hasSuccess = false;

    // Split mixed media into images and videos for platforms that can't mix them
    const allMediaUrls: string[] = post.mediaUrls || [];
    const imageUrls = allMediaUrls.filter((u: string) => !/\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(u));
    const videoUrls = allMediaUrls.filter((u: string) => /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(u));
    const hasMixedMedia = imageUrls.length > 0 && videoUrls.length > 0;
    
    for (const account of connectedAccounts) {
      try {
        console.log(`[Scheduler] Publishing to ${account.platform}...`);
        
        const refreshedAccount = await refreshTokenIfNeeded(account);

        // Use per-platform content override if available, fall back to base content
        const platformOverride = post.platformContent?.[account.platform as string];
        const postContent = platformOverride?.content
          ? `${platformOverride.content}${platformOverride.hashtags ? '\n' + platformOverride.hashtags : ''}`
          : post.content;

        // For Instagram and TikTok with mixed media, publish images and videos separately
        if (hasMixedMedia && (account.platform === 'instagram' || account.platform === 'tiktok')) {
          console.log(`[Scheduler] ${account.platform} - mixed media detected, splitting into ${imageUrls.length} images + ${videoUrls.length} videos`);
          
          const splitResults: any[] = [];

          if (imageUrls.length > 0) {
            const imgResult = await publishToSocial(account.platform as string, refreshedAccount.accessToken, postContent, imageUrls[0], imageUrls);
            splitResults.push({ type: 'images', data: imgResult });
          }

          for (const videoUrl of videoUrls) {
            const vidResult = await publishToSocial(account.platform as string, refreshedAccount.accessToken, postContent, videoUrl, [videoUrl]);
            splitResults.push({ type: 'video', data: vidResult });
          }

          publishResults[account.platform as string] = { success: true, data: splitResults, publishedAt: new Date().toISOString() };
        } else {
          const mediaUrl = allMediaUrls.length > 0 ? allMediaUrls[0] : undefined;
          const result = await publishToSocial(account.platform as string, refreshedAccount.accessToken, postContent, mediaUrl, allMediaUrls, post.scheduledAt || undefined);
          publishResults[account.platform as string] = { success: true, data: result, publishedAt: new Date().toISOString() };
        }

        hasSuccess = true;
        
        await Analytics.create({
          postId: post.id,
          platform: account.platform as string,
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
          engagementRate: 0
        });
        
        console.log(`[Scheduler] Successfully published to ${account.platform}`);
        
      } catch (error: any) {
        console.error(`[Scheduler] Failed to publish to ${account.platform}:`, error.message);
        publishResults[account.platform as string] = { 
          success: false, 
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }

    const allFailed = Object.values(publishResults).every((result: any) => !result.success);
    const hasFailures = Object.values(publishResults).some((result: any) => !result.success);
    
    let status: string;
    if (allFailed) {
      status = 'failed';
      schedulerStats.failedPosts++;
    } else if (hasFailures) {
      status = 'partial';
      schedulerStats.successfulPosts++;
    } else {
      status = 'published';
      schedulerStats.successfulPosts++;
    }
    
    await Post.update(post.id, {
      status,
      publishResults
    });

    // Notify user
    const platforms = Array.isArray(post.platforms) ? post.platforms.join(', ') : String(post.platforms);
    const preview = String(post.content).substring(0, 60);
    if (status === 'published') {
      await Notification.create({ userId: post.userId, type: 'success', title: 'Post Published', message: `Your post "${preview}..." was published to ${platforms}.`, postId: post.id });
    } else if (status === 'partial') {
      const failed = Object.entries(publishResults).filter(([, v]: any) => !v.success).map(([k]) => k).join(', ');
      await Notification.create({ userId: post.userId, type: 'warning', title: 'Post Partially Published', message: `Published to some platforms but failed on: ${failed}.`, postId: post.id });
    } else {
      await Notification.create({ userId: post.userId, type: 'error', title: 'Post Failed', message: `Failed to publish "${preview}..." to ${platforms}.`, postId: post.id });
    }

    console.log(`[Scheduler] Post ${post.id} completed with status: ${status}`);
    
  } catch (error) {
    console.error(`[Scheduler] Failed to publish scheduled post ${post.id}:`, error);
    schedulerStats.failedPosts++;
    
    try {
      await Post.update(post.id, {
        status: 'failed',
        publishResults: { 
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          timestamp: new Date().toISOString()
        }
      });
      await Notification.create({ userId: post.userId, type: 'error', title: 'Post Failed', message: `Failed to publish post: ${error instanceof Error ? error.message : 'Unknown error'}`, postId: post.id });
    } catch (updateError) {
      console.error(`[Scheduler] Failed to update post status:`, updateError);
    }
  }
}

const analyticsScheduler = cron.schedule('0 * * * *', async () => {
  try {
    console.log('[Analytics] Running scheduled analytics update');
    await updateAnalytics();
  } catch (error) {
    console.error('[Analytics] Update error:', error);
  }
}, {
  scheduled: true,
  timezone: "UTC"
});

async function updateAnalytics() {
  try {
    const recentAnalytics = await Analytics.findRecent(7);
    console.log(`[Analytics] Updating ${recentAnalytics.length} analytics records`);

    for (const analytics of recentAnalytics) {
      try {
        const postId = String(analytics.postId);
        const platform = String(analytics.platform);
        const userId = String(analytics.userId);

        const post = await Post.findById(postId);
        if (!post?.publishResults) continue;

        const platformResult = post.publishResults[platform];
        if (!platformResult?.success) continue;

        const account = await SocialAccount.findByUserAndPlatforms(userId, [platform]);
        if (!account?.length) continue;

        const { decrypt } = await import('../utils/crypto');
        const token = (() => { try { return decrypt(String(account[0].accessToken)); } catch { return String(account[0].accessToken); } })();

        let metrics: { views: number; likes: number; shares: number; comments: number; engagementRate: number } | null = null;

        if (platform === 'instagram') {
          const mediaId = platformResult.data?.id;
          if (mediaId) {
            const res = await axios.get(`https://graph.instagram.com/${mediaId}/insights`, {
              params: { metric: 'impressions,reach,likes,comments,shares', access_token: token }
            }).catch(() => null);

            if (res?.data?.data) {
              const m: Record<string, number> = {};
              res.data.data.forEach((d: any) => { m[d.name] = d.values?.[0]?.value ?? d.value ?? 0; });
              const likes = m.likes ?? 0;
              const comments = m.comments ?? 0;
              const shares = m.shares ?? 0;
              const reach = m.reach || m.impressions || 1;
              metrics = {
                views: m.impressions ?? m.reach ?? 0,
                likes,
                shares,
                comments,
                engagementRate: ((likes + comments + shares) / reach) * 100
              };
            }
          }
        }

        if (platform === 'tiktok') {
          // TikTok publish_id — metrics only available after video is posted from inbox
          // Use user stats as a proxy since video-level metrics need video_id post-publish
          const res = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
            params: { fields: 'follower_count,likes_count,video_count' },
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => null);

          if (res?.data?.data?.user) {
            const u = res.data.data.user;
            metrics = {
              views: u.video_count ?? 0,
              likes: u.likes_count ?? 0,
              shares: 0,
              comments: 0,
              engagementRate: u.follower_count > 0 ? (u.likes_count / u.follower_count) * 100 : 0
            };
          }
        }

        if (platform === 'youtube') {
          const videoId = platformResult.data?.videoId || platformResult.data?.data?.id;
          if (videoId) {
            const res = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
              params: { part: 'statistics', id: videoId },
              headers: { Authorization: `Bearer ${token}` }
            }).catch(() => null);
            const stats = res?.data?.items?.[0]?.statistics;
            if (stats) {
              const views = Number(stats.viewCount ?? 0);
              const likes = Number(stats.likeCount ?? 0);
              const comments = Number(stats.commentCount ?? 0);
              metrics = { views, likes, shares: Number(stats.favoriteCount ?? 0), comments, engagementRate: views > 0 ? ((likes + comments) / views) * 100 : 0 };
            }
          } else {
            // Fallback: channel-level stats
            const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
              params: { part: 'statistics', mine: true },
              headers: { Authorization: `Bearer ${token}` }
            }).catch(() => null);
            const stats = res?.data?.items?.[0]?.statistics;
            if (stats) metrics = { views: Number(stats.viewCount ?? 0), likes: 0, shares: 0, comments: 0, engagementRate: 0 };
          }
        }

        if (metrics) {
          await Analytics.update(String(analytics.id), metrics);
          console.log(`[Analytics] Updated ${platform} metrics for post ${postId}`);
        }
      } catch (err: any) {
        console.warn(`[Analytics] Failed to update record ${analytics.id}:`, err.message);
      }
    }

    console.log('[Analytics] Update completed');
  } catch (error) {
    console.error('[Analytics] Failed to update analytics:', error);
  }
}

export function getSchedulerHealth() {
  return {
    isRunning: postScheduler ? true : false,
    lastRunTime,
    stats: schedulerStats,
    uptimeSeconds: process.uptime()
  };
}

export async function triggerSchedulerManually() {
  console.log('[Scheduler] Manual trigger requested');
  const scheduledPosts = await Post.findScheduled(0);
  console.log(`[Scheduler] Found ${scheduledPosts.length} posts to publish`);
  
  for (const post of scheduledPosts) {
    await publishScheduledPost(post);
  }
  
  return {
    processed: scheduledPosts.length,
    stats: schedulerStats
  };
}

console.log('[Scheduler] ✅ Post scheduler initialized - running every minute');
console.log('[Scheduler] ✅ Analytics scheduler initialized - running every hour');

// Daily rollover check — runs at midnight UTC
cron.schedule('0 0 * * *', async () => {
  try {
    const { Database } = await import('../models');
    const { UserCreditsModel } = await import('../v2/schemas');
    // Find all users whose cycle has ended
    const expired = await Database.execute(
      "SELECT userId FROM UserCredits WHERE cycleEnd <= datetime('now')"
    );
    for (const row of expired.rows) {
      await UserCreditsModel.rollover(String(row.userId));
    }
    console.log(`[Rollover] Processed ${expired.rows.length} billing cycles`);
  } catch (err: any) {
    console.error('[Rollover] Error:', err.message);
  }
}, { timezone: 'UTC' });

// Also init credits for new users on auth — handled lazily via ensureCredits

export { publishScheduledPost, updateAnalytics, postScheduler, analyticsScheduler };
