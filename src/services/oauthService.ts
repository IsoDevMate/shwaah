import axios from 'axios';
import { OAuthTokens, PlatformUserInfo } from '../types';

// Exchange authorization code for access tokens
export async function exchangeCodeForTokens(platform: string, code: string): Promise<OAuthTokens> {
  const clientId = process.env[`${platform.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${platform.toUpperCase()}_CLIENT_SECRET`];
  
  // Use hardcoded redirect URI for TikTok to ensure consistency
  const redirectUri = platform === 'tiktok' 
    ? 'https://shwaah-8n4g.onrender.com/api/social/callback/tiktok'
    : process.env[`${platform.toUpperCase()}_REDIRECT_URI`] || `${process.env.REDIRECT_URI}/${platform}`;

  // Remove verbose logging

  const tokenUrls: Record<string, string> = {
    instagram: 'https://api.instagram.com/oauth/access_token',
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
    console.log(`Starting token exchange for ${platform} with code:`, code.substring(0, 20) + '...');
    let response;
    
    if (platform === 'instagram') {
      console.log('Instagram token request:', {
        url: tokenUrls[platform],
        data: tokenData[platform]
      });
      response = await axios.post(tokenUrls[platform],
        new URLSearchParams(tokenData[platform]).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    } else if (platform === 'tiktok') {
      console.log('TikTok token request data:', tokenData[platform]);
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
      console.log(`[${platform}] Token response:`, JSON.stringify(response.data, null, 2));
      
      // TikTok v2 returns data directly (not nested)
      const data = response.data;
      
      if (!data.access_token) {
        throw new Error(`No access token in TikTok response: ${JSON.stringify(response.data)}`);
      }
      
      console.log(`[${platform}] Extracted open_id:`, data.open_id);
      
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        open_id: data.open_id,
        scope: data.scope,
        token_type: data.token_type
      };
    }
    
    return response.data;
  } catch (error: any) {
    console.error(`Token exchange failed for ${platform}:`, error.response?.data || error.message);
    console.error('Full error response:', JSON.stringify(error.response?.data, null, 2));
    console.error('Request details:', {
      url: tokenUrls[platform],
      data: tokenData[platform]
    });
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Get user info from platform
export async function getPlatformUserInfo(platform: string, accessToken: string, openId?: string): Promise<PlatformUserInfo> {
  const userInfoUrls: Record<string, string> = {
    instagram: 'https://graph.instagram.com/me?fields=id,username',
    facebook: 'https://graph.facebook.com/me?fields=id,name',
    linkedin: 'https://api.linkedin.com/v2/people/~?projection=(id,localizedFirstName,localizedLastName)',
    youtube: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    tiktok: 'https://open.tiktokapis.com/v2/user/info/' // No query params in base URL
  };

  try {
    let response;
    
    if (platform === 'tiktok') {
      // TikTok v2 API - use the open_id directly without additional API call
      if (!openId) {
        throw new Error('TikTok requires open_id from token response');
      }
      
      console.log(`[${platform}] Using open_id as user identifier:`, openId);
      
      // Try to fetch additional user info, but fallback to open_id if it fails
      try {
        response = await axios.get(userInfoUrls[platform], {
          params: {
            fields: 'open_id,union_id,avatar_url,display_name'
          },
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        
        const userData = response.data.data?.user;
        if (userData) {
          return { 
            id: userData.open_id || openId,
            name: userData.display_name || 'TikTok User',
            username: userData.display_name || 'TikTok User'
          };
        }
      } catch (userInfoError: any) {
        console.warn(`[${platform}] Could not fetch user info, using open_id only:`, 
          userInfoError.response?.data || userInfoError.message);
      }
      
      // Fallback: use open_id as the identifier
      return { 
        id: openId,
        name: 'TikTok User',
        username: 'TikTok User'
      };
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
        // Already handled above in the TikTok-specific block
        throw new Error('TikTok user info should have been handled above');
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
    
    const response = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        access_token: shortLivedToken
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
