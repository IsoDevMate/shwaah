import express from 'express';
import axios from 'axios';
import { SocialAccount } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/crypto';
import { AuthRequest, OAuthTokens, PlatformUserInfo } from '../types';
import { asyncHandler, sendSuccess, sendError } from '../utils/routeHelpers';

const router = express.Router();

const PLATFORM_SCOPES: Record<string, string> = {
  instagram: 'instagram_basic,instagram_content_publish',
  facebook: 'pages_manage_posts,pages_read_engagement,publish_to_groups',
  linkedin: 'r_liteprofile,w_member_social',
  youtube: 'https://www.googleapis.com/auth/youtube.upload',
  tiktok: 'user.info.basic,video.publish'
};

const getAuthUrl = (platform: string, userId: number): string => {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const redirectUri = `${process.env.REDIRECT_URI}/${platform}`;
  const scopes = PLATFORM_SCOPES[platform];
  
  const authUrls: Record<string, string> = {
    instagram: `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    facebook: `https://www.facebook.com/v18.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}`,
    linkedin: `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&state=${userId}`,
    youtube: `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&access_type=offline&state=${userId}`,
    tiktok: `https://www.tiktok.com/auth/authorize/?client_key=${clientId}&response_type=code&scope=${scopes}&redirect_uri=${redirectUri}&state=${userId}`
  };
  
  return authUrls[platform];
};

// Get connected accounts
router.get('/accounts', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const accounts = await SocialAccount.findByUser(req.user!.id);
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Initiate OAuth flow
router.get('/connect/:platform', authenticateUser, (req: AuthRequest, res) => {
  const { platform } = req.params;
  
  if (!PLATFORM_SCOPES[platform]) {
    return res.status(400).json({ error: 'Unsupported platform' });
  }
  
  const authUrl = getAuthUrl(platform, req.user!.id);
  res.json({ authUrl });
});

// OAuth callback
router.get('/callback/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state: userId } = req.query;
    
    if (!code || !userId) {
      return res.status(400).json({ error: 'Missing code or state' });
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
    
    res.redirect(`http://localhost:3001/dashboard?connected=${platform}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Disconnect account
router.delete('/disconnect/:platform', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { platform } = req.params;
    
    await SocialAccount.updateByUserAndPlatform(req.user!.id, platform, { isActive: false });
    
    res.json({ message: `${platform} disconnected successfully` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

async function exchangeCodeForTokens(platform: string, code: string): Promise<OAuthTokens> {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`];
  const redirectUri = `${process.env.REDIRECT_URI}/${platform}`;
  
  const tokenEndpoints: Record<string, string> = {
    instagram: 'https://api.instagram.com/oauth/access_token',
    facebook: 'https://graph.facebook.com/v18.0/oauth/access_token',
    linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
    youtube: 'https://oauth2.googleapis.com/token',
    tiktok: 'https://open-api.tiktok.com/oauth/access_token/'
  };
  
  const response = await axios.post(tokenEndpoints[platform], {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });
  
  return response.data;
}

async function getPlatformUserInfo(platform: string, accessToken: string): Promise<PlatformUserInfo> {
  const userEndpoints: Record<string, string> = {
    instagram: 'https://graph.instagram.com/me?fields=id,username',
    facebook: 'https://graph.facebook.com/me?fields=id,name',
    linkedin: 'https://api.linkedin.com/v2/people/~?projection=(id,localizedFirstName,localizedLastName)',
    youtube: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    tiktok: 'https://open-api.tiktok.com/user/info/?fields=open_id,union_id,avatar_url,display_name'
  };
  
  const response = await axios.get(userEndpoints[platform], {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  // Normalize response based on platform
  switch (platform) {
    case 'linkedin':
      return {
        id: response.data.id,
        name: `${response.data.localizedFirstName} ${response.data.localizedLastName}`
      };
    case 'youtube':
      return {
        id: response.data.items[0].id,
        name: response.data.items[0].snippet.title
      };
    case 'tiktok':
      return {
        id: response.data.data.open_id,
        username: response.data.data.display_name
      };
    default:
      return response.data;
  }
}

export default router;
