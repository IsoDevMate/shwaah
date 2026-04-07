/**
 * V3 Social Routes
 * Extends v1 social with explicit Facebook support and Pages API.
 */
import express from 'express';
import axios from 'axios';
import { SocialAccount } from '../../models/tursoModels';
import { authenticateUser } from '../../middleware/auth';
import { encrypt, decrypt } from '../../utils/crypto';
import { AuthRequest } from '../../types';
import { exchangeCodeForTokens, getPlatformUserInfo, exchangeForLongLivedToken } from '../../services/oauthService';
import { asyncHandler, sendSuccess, sendError } from '../../utils/routeHelpers';
import { platformLimitMiddleware } from '../../v2/guards/creditGuard';

const router = express.Router();

const PLATFORMS = ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok'] as const;
type Platform = typeof PLATFORMS[number];

const PLATFORM_SCOPES: Record<Platform, string> = {
  instagram: 'instagram_business_basic,instagram_business_content_publish',
  facebook: 'pages_show_list,pages_manage_posts,pages_read_engagement,publish_to_groups,public_profile',
  linkedin: 'openid,email,profile,w_member_social',
  youtube: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  tiktok: 'user.info.basic,user.info.profile,user.info.stats,video.upload,video.list'
};

const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://shwaah-8n4g.onrender.com';

const getAuthUrl = (platform: Platform, userId: string): string => {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  if (!clientId) throw new Error(`Missing client ID for ${platform}`);

  const redirectUri = platform === 'tiktok'
    ? `${BASE_URL}/api/v3/social/callback/tiktok`
    : (process.env[`${platform.toUpperCase()}_REDIRECT_URI`] ?? `${BASE_URL}/api/v3/social/callback/${platform}`);

  const scopes = PLATFORM_SCOPES[platform];

  const urls: Record<Platform, string> = {
    instagram: `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${userId}`,
    facebook: `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${userId}`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${userId}`,
    youtube: `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&response_type=code&access_type=offline&state=${userId}`,
    tiktok: `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientId}&scope=${encodeURIComponent(scopes)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`
  };

  return urls[platform];
};

// GET /api/v3/social/accounts
router.get('/accounts', authenticateUser, asyncHandler('SocialV3', 'GetAccounts')(async (req: AuthRequest, res) => {
  const accounts = await SocialAccount.findByUser(req.user!.id);
  return sendSuccess(req, res, { accounts }, 'Connected accounts retrieved');
}));

// GET /api/v3/social/connect/:platform
router.get('/connect/:platform', authenticateUser, platformLimitMiddleware, asyncHandler('SocialV3', 'InitiateOAuth')(async (req: AuthRequest, res) => {
  const platform = req.params.platform as Platform;
  if (!PLATFORMS.includes(platform)) {
    return sendError(req, res, new Error('Unsupported platform'), 'Invalid platform', 400, 'UNSUPPORTED_PLATFORM');
  }
  const authUrl = getAuthUrl(platform, req.user!.id);
  return sendSuccess(req, res, { authUrl }, 'OAuth URL generated');
}));

// GET /api/v3/social/callback/:platform
router.get('/callback/:platform', asyncHandler('SocialV3', 'OAuthCallback')(async (req, res) => {
  const { platform } = req.params;
  const { code, state: userId, error, error_description } = req.query;

  if (error) {
    return sendError(req, res, new Error(String(error_description || error)), 'OAuth authorization failed', 400, 'OAUTH_ERROR');
  }
  if (!code || !userId) {
    return sendError(req, res, new Error('Missing code or state'), 'OAuth callback failed', 400, 'MISSING_OAUTH_PARAMS');
  }

  try {
    let tokens = await exchangeCodeForTokens(platform, code as string);

    if (platform === 'instagram') {
      const longLived = await exchangeForLongLivedToken(tokens.access_token);
      tokens = { ...tokens, access_token: longLived.access_token, expires_in: longLived.expires_in };
    }

    // For Facebook: exchange user token for a long-lived token (60 days)
    if (platform === 'facebook') {
      const llRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.FACEBOOK_CLIENT_ID,
          client_secret: process.env.FACEBOOK_CLIENT_SECRET,
          fb_exchange_token: tokens.access_token
        }
      });
      tokens = { ...tokens, access_token: llRes.data.access_token, expires_in: llRes.data.expires_in };
    }

    const userInfo = await getPlatformUserInfo(
      platform,
      tokens.access_token,
      platform === 'tiktok' ? (tokens as any).open_id : undefined
    );

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

    const frontendUrl = process.env.FRONTEND_URL || 'https://shwaah-frontend-31fs.vercel.app';
    res.redirect(`${frontendUrl}/dashboard?connected=${platform}`);
  } catch (err: any) {
    console.error(`[V3] OAuth callback failed for ${platform}:`, err.message);
    return sendError(req, res, err, `${platform} connection failed`, 500, 'OAUTH_CALLBACK_ERROR');
  }
}));

// GET /api/v3/social/facebook/pages  — list pages the user manages
router.get('/facebook/pages', authenticateUser, asyncHandler('SocialV3', 'FacebookPages')(async (req: AuthRequest, res) => {
  const [account] = await SocialAccount.findByUserAndPlatforms(req.user!.id, ['facebook']);
  if (!account) {
    return sendError(req, res, new Error('Facebook not connected'), 'Facebook account not connected', 404, 'NOT_CONNECTED');
  }

  const token = decrypt(String(account.accessToken));
  const pagesRes = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
    params: { access_token: token, fields: 'id,name,category,picture,fan_count' }
  });

  return sendSuccess(req, res, { pages: pagesRes.data.data }, 'Facebook pages retrieved');
}));

// DELETE /api/v3/social/disconnect/:platform
router.delete('/disconnect/:platform', authenticateUser, asyncHandler('SocialV3', 'Disconnect')(async (req: AuthRequest, res) => {
  const platform = req.params.platform as Platform;
  if (!PLATFORMS.includes(platform)) {
    return sendError(req, res, new Error('Unsupported platform'), 'Invalid platform', 400, 'UNSUPPORTED_PLATFORM');
  }
  await SocialAccount.updateByUserAndPlatform(req.user!.id, platform, { isActive: false });
  return sendSuccess(req, res, null, `${platform} disconnected successfully`);
}));

export default router;
