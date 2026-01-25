import express from 'express';
import axios from 'axios';
import { SocialAccount } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/crypto';
import { AuthRequest, OAuthTokens, PlatformUserInfo } from '../types';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';
import { exchangeCodeForTokens, getPlatformUserInfo } from '../services/oauthService';

const router = express.Router();

const PLATFORM_SCOPES: Record<string, string> = {
  instagram: 'instagram_business_basic,instagram_business_content_publish',
  facebook: 'pages_manage_posts,pages_read_engagement,publish_to_groups',
  linkedin: 'openid,email,profile,w_member_social',
  youtube: 'https://www.googleapis.com/auth/youtube.upload',
  tiktok: 'user.info.basic,video.publish'
};

const getAuthUrl = (platform: string, userId: number): string => {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const redirectUri = `${process.env.REDIRECT_URI}/${platform}`;
  const scopes = PLATFORM_SCOPES[platform];
  
  const authUrls: Record<string, string> = {
    instagram: `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`, // Updated for new Instagram API
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${userId}`,
    youtube: `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&access_type=offline&state=${userId}`,
    tiktok: `https://www.tiktok.com/auth/authorize/?client_key=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${redirectUri}&state=${userId}`
  };
  
  return authUrls[platform];
};

// Get connected accounts
router.get('/accounts', authenticateUser, asyncHandler('Social', 'GetAccounts')(async (req: AuthRequest, res) => {
  const accounts = await SocialAccount.findByUser(req.user!.id);
  return sendSuccess(req, res, { accounts }, 'Connected accounts retrieved');
}));

// Initiate OAuth flow
router.get('/connect/:platform', authenticateUser, asyncHandler('Social', 'InitiateOAuth')(async (req: AuthRequest, res) => {
  const { platform } = req.params;
  
  if (!PLATFORM_SCOPES[platform]) {
    return sendError(req, res, new Error('Unsupported platform'), 'Invalid platform', 400, 'UNSUPPORTED_PLATFORM');
  }
  
  const authUrl = getAuthUrl(platform, req.user!.id);
  return sendSuccess(req, res, { authUrl }, 'OAuth URL generated');
}));

// OAuth callback
router.get('/callback/:platform', asyncHandler('Social', 'OAuthCallback')(async (req, res) => {
  const { platform } = req.params;
  const { code, state: userId } = req.query;
  
  if (!code || !userId) {
    return sendError(req, res, new Error('Missing code or state'), 'OAuth callback failed', 400, 'MISSING_OAUTH_PARAMS');
  }
  
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(platform, code as string);
  
  // Get user info from platform
  const userInfo = await getPlatformUserInfo(platform, tokens.access_token);
  
  // Save to database
  await SocialAccount.upsert({
    userId: parseInt(userId as string),
    platform: platform as any,
    platformUserId: userInfo.id,
    platformUsername: userInfo.username || userInfo.name,
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
    isActive: true
  });
  
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?connected=${platform}`);
}));

// Disconnect account
router.delete('/disconnect/:platform', authenticateUser, asyncHandler('Social', 'Disconnect')(async (req: AuthRequest, res) => {
  const { platform } = req.params;
  
  await SocialAccount.updateByUserAndPlatform(req.user!.id, platform, { isActive: false });
  
  return sendSuccess(req, res, null, `${platform} disconnected successfully`);
}));

export default router;
