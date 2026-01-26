import axios from 'axios';
import { OAuthTokens, PlatformUserInfo } from '../types';

// Exchange authorization code for access tokens
export async function exchangeCodeForTokens(platform: string, code: string): Promise<OAuthTokens> {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`];
  const redirectUri = `${process.env.REDIRECT_URI}/${platform}`;

  // Remove verbose logging

  const tokenUrls: Record<string, string> = {
    instagram: 'https://graph.facebook.com/v19.0/oauth/access_token', // Use Facebook Graph API for Instagram Business
    facebook: 'https://graph.facebook.com/v18.0/oauth/access_token',
    linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
    youtube: 'https://oauth2.googleapis.com/token',
    tiktok: 'https://open.tiktokapis.com/v2/oauth/token/'
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

  try {
    let response;
    
    if (platform === 'instagram') {
      response = await axios.get(tokenUrls[platform], {
        params: tokenData[platform]
      });
    } else if (platform === 'tiktok') {
      response = await axios.post(tokenUrls[platform], 
        new URLSearchParams(tokenData[platform]).toString(),
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache'
          }
        }
      );
    } else {
      response = await axios.post(tokenUrls[platform], tokenData[platform], {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    }
    
    if (platform === 'tiktok') {
      return {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
        open_id: response.data.open_id,
        scope: response.data.scope
      };
    }
    
    return response.data;
  } catch (error: any) {
    console.error(`Token exchange failed for ${platform}:`, error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Get user info from platform
export async function getPlatformUserInfo(platform: string, accessToken: string): Promise<PlatformUserInfo> {
  const userInfoUrls: Record<string, string> = {
    instagram: 'https://graph.instagram.com/me?fields=id,username', // Updated to use Graph API
    facebook: 'https://graph.facebook.com/me?fields=id,name',
    linkedin: 'https://api.linkedin.com/v2/people/~?projection=(id,localizedFirstName,localizedLastName)',
    youtube: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    tiktok: 'https://open.tiktokapis.com/v2/user/info/'
  };

  try {
    let response;
    
    if (platform === 'tiktok') {
      // TikTok v2 API requires POST with fields in body
      response = await axios.post(userInfoUrls[platform], {
        fields: ['open_id', 'union_id', 'avatar_url', 'display_name']
      }, {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
    } else {
      response = await axios.get(userInfoUrls[platform], {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }

    // Remove verbose logging

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
          name: response.data.data.user.display_name,
          username: response.data.data.user.display_name
        };
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error: any) {
    console.error(`Failed to get user info for ${platform}:`, error);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Exchange short-lived token for long-lived token (Instagram only)
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{ access_token: string; expires_in: number }> {
  try {
    // Remove verbose logging
    
    const response = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.INSTAGRAM_CLIENT_ID,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });
    
    // Remove verbose logging
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to get long-lived token:', error);
    console.error('Stack:', error.stack);
    throw error;
  }
}
