import axios from 'axios';
import { OAuthTokens, PlatformUserInfo } from '../types';

// Exchange authorization code for access tokens
export async function exchangeCodeForTokens(platform: string, code: string): Promise<OAuthTokens> {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`];
  const redirectUri = `${process.env.REDIRECT_URI}/${platform}`;

  const tokenUrls: Record<string, string> = {
    instagram: 'https://api.instagram.com/oauth/access_token', // Same URL for new Instagram API
    facebook: 'https://graph.facebook.com/v18.0/oauth/access_token',
    linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
    youtube: 'https://oauth2.googleapis.com/token',
    tiktok: 'https://open-api.tiktok.com/oauth/access_token/'
  };

  const tokenData: Record<string, any> = {
    instagram: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code
    },
    facebook: {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code
    },
    linkedin: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    },
    youtube: {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    },
    tiktok: {
      client_key: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    }
  };

  const response = await axios.post(tokenUrls[platform], tokenData[platform], {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  return response.data;
}

// Get user info from platform
export async function getPlatformUserInfo(platform: string, accessToken: string): Promise<PlatformUserInfo> {
  const userInfoUrls: Record<string, string> = {
    instagram: 'https://graph.instagram.com/me?fields=id,username', // Updated to use Graph API
    facebook: 'https://graph.facebook.com/me?fields=id,name',
    linkedin: 'https://api.linkedin.com/v2/people/~?projection=(id,localizedFirstName,localizedLastName)',
    youtube: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    tiktok: 'https://open-api.tiktok.com/user/info/?fields=open_id,union_id,avatar_url,display_name'
  };

  const response = await axios.get(userInfoUrls[platform], {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  // Transform response based on platform
  switch (platform) {
    case 'instagram':
      return { id: response.data.id, username: response.data.username };
    case 'facebook':
      return { id: response.data.id, name: response.data.name };
    case 'linkedin':
      return { 
        id: response.data.id, 
        name: `${response.data.localizedFirstName} ${response.data.localizedLastName}` 
      };
    case 'youtube':
      const channel = response.data.items[0];
      return { id: channel.id, name: channel.snippet.title };
    case 'tiktok':
      return { 
        id: response.data.data.user.open_id, 
        name: response.data.data.user.display_name 
      };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
