import express from 'express';
import axios from 'axios';
import { SocialAccount } from '../models/tursoModels';
import { Database } from '../models';
import { authenticateUser } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/crypto';
import { AuthRequest, OAuthTokens, PlatformUserInfo } from '../types';
import { refreshTokenIfNeeded } from '../services/socialService';
import { exchangeCodeForTokens, getPlatformUserInfo, exchangeForLongLivedToken } from '../services/oauthService';
import { connectSocialSchema } from '../schemas';
import { platformLimitMiddleware } from '../v2/guards/creditGuard';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';

const router = express.Router();

const PLATFORM_SCOPES: Record<string, string> = {
  instagram: 'instagram_business_basic,instagram_business_content_publish',
  facebook: 'pages_manage_posts,pages_read_engagement,publish_to_groups',
  linkedin: 'openid,email,profile,w_member_social',
  youtube: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  tiktok: 'user.info.basic,user.info.profile,user.info.stats,video.upload,video.list'
};

const getAuthUrl = (platform: string, userId: string): string => {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const redirectUri = platform === 'tiktok'
    ? 'https://shwaah-8n4g.onrender.com/api/social/callback/tiktok'
    : (process.env[`${platform.toUpperCase()}_REDIRECT_URI`] ?? '');
  const scopes = PLATFORM_SCOPES[platform];

  if (!clientId) throw new Error(`Missing client ID for ${platform}`);
  
  const authUrls: Record<string, string> = {
    instagram: `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${userId}`,
    youtube: `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&access_type=offline&state=${userId}`,
    tiktok: `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientId}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`
  };
  
  return authUrls[platform];
};

// Get connected accounts
router.get('/accounts', authenticateUser, asyncHandler('Social', 'GetAccounts')(async (req: AuthRequest, res) => {
  const accounts = await SocialAccount.findByUser(req.user!.id);
  return sendSuccess(req, res, { accounts }, 'Connected accounts retrieved');
}));

// Fetch live profile metrics for all connected accounts
router.get('/metrics', authenticateUser, asyncHandler('Social', 'GetMetrics')(async (req: AuthRequest, res) => {
  const accounts = await SocialAccount.findByUser(req.user!.id);
  const metrics: Record<string, any> = {};

  await Promise.all(accounts.map(async (account: any) => {
    const platform = String(account.platform);

    try {
      // Refresh token if needed (handles YouTube + TikTok expiry)
      const freshAccount = await refreshTokenIfNeeded(account).catch(() => account);
      const token = (() => { try { return decrypt(String(freshAccount.accessToken)); } catch { return String(freshAccount.accessToken); } })();
      if (platform === 'instagram') {
        const r = await axios.get('https://graph.instagram.com/me', {
          params: { fields: 'id,username,followers_count,follows_count,media_count,profile_picture_url', access_token: token }
        });
        metrics[platform] = {
          username: r.data.username,
          followers: r.data.followers_count ?? 0,
          following: r.data.follows_count ?? 0,
          posts: r.data.media_count ?? 0,
          avatar: r.data.profile_picture_url ?? null,
        };
      }

      if (platform === 'tiktok') {
        const r = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
          params: { fields: 'display_name,avatar_url,follower_count,following_count,likes_count,video_count' },
          headers: { Authorization: `Bearer ${token}` }
        });
        const u = r.data?.data?.user ?? {};
        metrics[platform] = {
          username: u.display_name ?? null,
          followers: u.follower_count ?? 0,
          following: u.following_count ?? 0,
          likes: u.likes_count ?? 0,
          posts: u.video_count ?? 0,
          avatar: u.avatar_url ?? null,
        };
      }

      if (platform === 'linkedin') {
        const r = await axios.get('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        metrics[platform] = {
          username: r.data.name ?? null,
          avatar: r.data.picture ?? null,
        };
      }

      if (platform === 'youtube') {
        const r = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'snippet,statistics', mine: true },
          headers: { Authorization: `Bearer ${token}` }
        });
        const ch = r.data?.items?.[0];
        metrics[platform] = {
          username: ch?.snippet?.title ?? null,
          subscribers: Number(ch?.statistics?.subscriberCount ?? 0),
          posts: Number(ch?.statistics?.videoCount ?? 0),
          views: Number(ch?.statistics?.viewCount ?? 0),
          avatar: ch?.snippet?.thumbnails?.default?.url ?? null,
        };
      }

      if (platform === 'facebook') {
        const r = await axios.get('https://graph.facebook.com/me', {
          params: { fields: 'id,name,picture', access_token: token }
        });
        metrics[platform] = {
          username: r.data.name ?? null,
          avatar: r.data.picture?.data?.url ?? null,
        };
      }
    } catch (err: any) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.response?.data?.error?.message || err.message;
      console.warn(`[Metrics] Failed to fetch ${platform} metrics (${status ?? 'no status'}):`, detail);
      metrics[platform] = { error: status === 401 ? 'Token expired or unauthorized — reconnect account' : 'Could not fetch metrics' };
    }
  }));

  return sendSuccess(req, res, { metrics }, 'Platform metrics retrieved');
}));

// Initiate OAuth flow
router.get('/connect/:platform', authenticateUser, platformLimitMiddleware, asyncHandler('Social', 'InitiateOAuth')(async (req: AuthRequest, res) => {
  const validation = connectSocialSchema.safeParse({ platform: req.params.platform });
  if (!validation.success) {
    return sendError(req, res, new Error('Unsupported platform'), 'Invalid platform', 400, 'UNSUPPORTED_PLATFORM');
  }
  
  const { platform } = validation.data;
  const authUrl = getAuthUrl(platform, req.user!.id);
  return sendSuccess(req, res, { authUrl }, 'OAuth URL generated');
}));

// OAuth callback
router.get('/callback/:platform', asyncHandler('Social', 'OAuthCallback')(async (req, res) => {
  const { platform } = req.params;
  const { code, state: userId, error, error_code, error_message, error_description } = req.query;

  if (error || error_code) {
    const msg = error_description || error_message || error;
    console.error(`OAuth error from ${platform}:`, msg);
    return sendError(req, res, new Error(`OAuth error: ${msg}`), 'OAuth authorization failed', 400, 'OAUTH_ERROR');
  }
  
  if (!code || !userId) {
    console.error(`Missing OAuth params for ${platform}:`, { code: !!code, userId: !!userId });
    return sendError(req, res, new Error('Missing code or state'), 'OAuth callback failed', 400, 'MISSING_OAUTH_PARAMS');
  }
  
  try {
    // Remove verbose logging
    // Exchange code for tokens
    let tokens = await exchangeCodeForTokens(platform, code as string);
    
    // For Instagram, exchange short-lived token for long-lived token (60 days)
    if (platform === 'instagram') {
      // Remove verbose logging
      const longLivedTokenData = await exchangeForLongLivedToken(tokens.access_token);
      tokens = {
        ...tokens,
        access_token: longLivedTokenData.access_token,
        expires_in: longLivedTokenData.expires_in
      };
    }
    
    // Remove verbose logging
    
    // Remove verbose logging
    // Get user info from platform
    console.log('TikTok tokens received:', platform === 'tiktok' ? tokens : 'Not TikTok');
    const userInfo = await getPlatformUserInfo(
      platform, 
      tokens.access_token,
      platform === 'tiktok' ? (tokens as any).open_id : undefined
    );
    // Remove verbose logging
    
    // Save to database
    await SocialAccount.upsert({
      userId: String(userId),
      platform: platform as any,
      platformUserId: userInfo.id,
      platformUsername: userInfo.username || userInfo.name,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      isActive: true
    });
    
    // Remove verbose logging
    res.redirect(`${process.env.FRONTEND_URL || 'https://shwaah-frontend-31fs.vercel.app'}/dashboard?connected=${platform}`);
  } catch (error: any) {
    console.error(`OAuth callback failed for ${platform}:`, error);
    console.error('Stack:', error.stack);
    return sendError(req, res, error, `${platform} connection failed`, 500, 'OAUTH_CALLBACK_ERROR');
  }
}));

// Disconnect account
router.delete('/disconnect/:platform', authenticateUser, asyncHandler('Social', 'Disconnect')(async (req: AuthRequest, res) => {
  const validation = connectSocialSchema.safeParse({ platform: req.params.platform });
  if (!validation.success) {
    return sendError(req, res, new Error('Unsupported platform'), 'Invalid platform', 400, 'UNSUPPORTED_PLATFORM');
  }
  const { platform } = validation.data;
  await SocialAccount.updateByUserAndPlatform(req.user!.id, platform, { isActive: false });
  return sendSuccess(req, res, null, `${platform} disconnected successfully`);
}));

// Disconnect a specific account by ID
router.delete('/disconnect-account/:accountId', authenticateUser, asyncHandler('Social', 'DisconnectAccount')(async (req: AuthRequest, res) => {
  const { accountId } = req.params;
  const account = await SocialAccount.findById(accountId);
  if (!account || String(account.userId) !== req.user!.id) {
    return sendError(req, res, new Error('Account not found'), 'Account not found', 404, 'NOT_FOUND');
  }
  await SocialAccount.update(accountId, { accessToken: String(account.accessToken), expiresAt: null, isActive: false });
  return sendSuccess(req, res, null, 'Account disconnected');
}));

// Force reconnect (disconnect and get new auth URL)
router.post('/reconnect/:platform', authenticateUser, asyncHandler('Social', 'Reconnect')(async (req: AuthRequest, res) => {
  const validation = connectSocialSchema.safeParse({ platform: req.params.platform });
  if (!validation.success) {
    return sendError(req, res, new Error('Unsupported platform'), 'Invalid platform', 400, 'UNSUPPORTED_PLATFORM');
  }
  
  const { platform } = validation.data;
  
  // Disconnect existing account
  await SocialAccount.updateByUserAndPlatform(req.user!.id, platform, { isActive: false });
  
  // Generate new auth URL
  const authUrl = getAuthUrl(platform, req.user!.id);
  
  console.log(`[Social] ${platform} marked for reconnection for user ${req.user!.id}`);
  
  return sendSuccess(req, res, { authUrl }, `${platform} disconnected. Use the authUrl to reconnect with proper permissions.`);
}));

// GET /content-summary/:platform — aggregated content stats for the accounts page
router.get('/content-summary/:platform', authenticateUser, asyncHandler('Social', 'ContentSummary')(async (req: AuthRequest, res) => {
  const { platform } = req.params;
  const userId = req.user!.id;

  // Posts for this platform in last 90 days
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const postsRes = await Database.execute(
    `SELECT id, content, createdAt, publishResults FROM Posts
     WHERE userId = ? AND status = 'published' AND platforms LIKE ? AND createdAt >= ?
     ORDER BY createdAt DESC LIMIT 100`,
    [userId, `%${platform}%`, since]
  );
  const posts = postsRes.rows;

  // Analytics for those posts
  const postIds = posts.map((p: any) => p.id);
  let analytics: any[] = [];
  if (postIds.length > 0) {
    const placeholders = postIds.map(() => '?').join(',');
    const aRes = await Database.execute(
      `SELECT a.*, p.createdAt as postDate, p.content FROM Analytics a
       JOIN Posts p ON a.postId = p.id
       WHERE a.postId IN (${placeholders}) AND a.platform = ?`,
      [...postIds, platform]
    );
    analytics = aRes.rows;
  }

  // Content performance totals
  const contentPerformance = {
    totalVideos: posts.length,
    totalViews: analytics.reduce((s: number, a: any) => s + (Number(a.views) || 0), 0),
    totalLikes: analytics.reduce((s: number, a: any) => s + (Number(a.likes) || 0), 0),
    averageEngagementRate: analytics.length
      ? analytics.reduce((s: number, a: any) => s + (Number(a.engagementRate) || 0), 0) / analytics.length
      : 0,
    postingFrequency: posts.length > 0 ? parseFloat((posts.length / 13).toFixed(1)) : 0, // per week over 90d
  };

  // Recent activity
  const now = Date.now();
  const recentActivity = {
    lastVideoDate: posts[0]?.createdAt ?? null,
    videosThisWeek: posts.filter((p: any) => now - new Date(String(p.createdAt)).getTime() < 7 * 86400000).length,
    videosThisMonth: posts.filter((p: any) => now - new Date(String(p.createdAt)).getTime() < 30 * 86400000).length,
  };

  // Posting times heatmap — hour + day of week from createdAt
  const timeBuckets: Record<string, { count: number; totalViews: number }> = {};
  for (const p of posts) {
    const d = new Date(String(p.createdAt));
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    if (!timeBuckets[key]) timeBuckets[key] = { count: 0, totalViews: 0 };
    timeBuckets[key].count++;
    const a = analytics.find((x: any) => x.postId === p.id);
    timeBuckets[key].totalViews += a ? Number(a.views) || 0 : 0;
  }
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const postingTimes = Object.entries(timeBuckets)
    .map(([key, v]) => {
      const [day, hour] = key.split('-').map(Number);
      return { day: DAYS[day], hour, timeLabel: `${String(hour).padStart(2,'0')}:00 - ${String(hour+1).padStart(2,'0')}:00`, postCount: v.count, avgViews: v.count ? Math.round(v.totalViews / v.count) : 0 };
    })
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 5);

  // Hashtag analysis from post content
  const hashtagMap: Record<string, { count: number; totalViews: number }> = {};
  for (const p of posts) {
    const tags = String(p.content || '').match(/#[a-zA-Z0-9_]+/g) ?? [];
    const a = analytics.find((x: any) => x.postId === p.id);
    const views = a ? Number(a.views) || 0 : 0;
    for (const tag of tags) {
      const t = tag.toLowerCase();
      if (!hashtagMap[t]) hashtagMap[t] = { count: 0, totalViews: 0 };
      hashtagMap[t].count++;
      hashtagMap[t].totalViews += views;
    }
  }
  const topHashtags = Object.entries(hashtagMap)
    .map(([tag, v]) => ({ tag, count: v.count, totalViews: v.totalViews }))
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 10);

  // Performance timeline (weekly buckets)
  const weekMap: Record<string, { views: number; likes: number; posts: number }> = {};
  for (const a of analytics) {
    const week = new Date(String(a.postDate));
    week.setUTCDate(week.getUTCDate() - week.getUTCDay());
    const key = week.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = { views: 0, likes: 0, posts: 0 };
    weekMap[key].views += Number(a.views) || 0;
    weekMap[key].likes += Number(a.likes) || 0;
    weekMap[key].posts++;
  }
  const performanceTimeline = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, v]) => ({ week, ...v }));

  // Recent videos (last 5)
  const recentVideos = posts.slice(0, 5).map((p: any) => {
    const a = analytics.find((x: any) => x.postId === p.id);
    return { id: p.id, content: String(p.content || '').slice(0, 100), createdAt: p.createdAt, views: a ? Number(a.views) || 0 : 0, likes: a ? Number(a.likes) || 0 : 0 };
  });

  return sendSuccess(req, res, {
    recentVideos,
    topPerformingHashtags: topHashtags,
    postingTimes,
    contentPerformance,
    recentActivity,
    hashtagAnalysis: { topHashtags, trendingHashtags: topHashtags.slice(0, 3) },
    performanceTimeline,
  }, 'Content summary retrieved');
}));

export default router;
