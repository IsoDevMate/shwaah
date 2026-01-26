import express from 'express';
import axios from 'axios';
import { SocialAccount } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/crypto';
import { AuthRequest, OAuthTokens, PlatformUserInfo } from '../types';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';
import { exchangeCodeForTokens, getPlatformUserInfo, exchangeForLongLivedToken } from '../services/oauthService';

const router = express.Router();

const PLATFORM_SCOPES: Record<string, string> = {
  instagram: 'instagram_basic,instagram_content_publish,pages_read_engagement,pages_show_list,business_management',
  facebook: 'pages_manage_posts,pages_read_engagement,publish_to_groups',
  linkedin: 'openid,email,profile,w_member_social',
  youtube: 'https://www.googleapis.com/auth/youtube.upload',
  tiktok: 'user.info.basic,video.list,video.upload'
};

const getAuthUrl = (platform: string, userId: number): string => {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  // Use hardcoded redirect URI for TikTok to ensure consistency
  const redirectUri = platform === 'tiktok' 
    ? 'https://shwaah.onrender.com/api/social/callback/tiktok'
    : process.env[`${platform.toUpperCase()}_REDIRECT_URI`];
  const scopes = PLATFORM_SCOPES[platform];
  
  if (!clientId) {
    throw new Error(`Missing client ID for ${platform}`);
  }
  
  const authUrls: Record<string, string> = {
    instagram: `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${userId}`,
    youtube: `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&access_type=offline&state=${userId}`,
    tiktok: `https://www.tiktok.com/v2/auth/authorize/?client_key=${clientId}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`
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
  const { code, state: userId, error, error_description } = req.query;
  
  // Remove verbose logging
  
  if (error) {
    console.error(`OAuth error from ${platform}:`, error, error_description);
    return sendError(req, res, new Error(`OAuth error: ${error_description || error}`), 'OAuth authorization failed', 400, 'OAUTH_ERROR');
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
      userId: parseInt(userId as string),
      platform: platform as any,
      platformUserId: userInfo.id,
      platformUsername: userInfo.username || userInfo.name,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      isActive: true
    });
    
    // Remove verbose logging
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?connected=${platform}`);
  } catch (error: any) {
    console.error(`OAuth callback failed for ${platform}:`, error);
    console.error('Stack:', error.stack);
    return sendError(req, res, error, `${platform} connection failed`, 500, 'OAUTH_CALLBACK_ERROR');
  }
}));

// Disconnect account
router.delete('/disconnect/:platform', authenticateUser, asyncHandler('Social', 'Disconnect')(async (req: AuthRequest, res) => {
  const { platform } = req.params;
  
  await SocialAccount.updateByUserAndPlatform(req.user!.id, platform, { isActive: false });
  
  return sendSuccess(req, res, null, `${platform} disconnected successfully`);
}));

export default router;
