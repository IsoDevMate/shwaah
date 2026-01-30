import axios from 'axios';
import { decrypt, encrypt } from '../utils/crypto';
import { getSignedUrlForFile } from '../utils/r2Storage';
import { SocialAccount } from '../models/tursoModels';
import { PublishResult, OAuthTokens } from '../types';

interface PlatformConfig {
  baseUrl: string;
  postEndpoint: string;
  userEndpoint: string;
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  instagram: {
    baseUrl: 'https://graph.instagram.com',
    postEndpoint: '/me/media',
    userEndpoint: '/me'
  },
  facebook: {
    baseUrl: 'https://graph.facebook.com',
    postEndpoint: '/me/feed',
    userEndpoint: '/me'
  },
  linkedin: {
    baseUrl: 'https://api.linkedin.com',
    postEndpoint: '/v2/ugcPosts',
    userEndpoint: '/v2/people/~'
  },
  youtube: {
    baseUrl: 'https://www.googleapis.com',
    postEndpoint: '/youtube/v3/videos',
    userEndpoint: '/youtube/v3/channels'
  },
  tiktok: {
    baseUrl: 'https://open.tiktokapis.com',
    // Use INBOX endpoint (requires video.upload scope)
    postEndpoint: '/v2/post/publish/inbox/video/init/',
    userEndpoint: '/v2/user/info/'
  }
};

const publishToInstagram = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  const config = PLATFORM_CONFIGS.instagram;
  
  if (!mediaUrl) {
    throw new Error('Instagram requires media content');
  }

  // Create media object
  const mediaResponse = await axios.post(`${config.baseUrl}${config.postEndpoint}`, {
    image_url: mediaUrl,
    caption: content,
    access_token: accessToken
  });
  
  // Publish media
  const publishResponse = await axios.post(`${config.baseUrl}/me/media_publish`, {
    creation_id: mediaResponse.data.id,
    access_token: accessToken
  });
  
  return publishResponse.data;
};

const publishToFacebook = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  const config = PLATFORM_CONFIGS.facebook;
  
  const postData: any = {
    message: content,
    access_token: accessToken
  };
  
  if (mediaUrl) {
    postData.link = mediaUrl;
  }
  
  const response = await axios.post(`${config.baseUrl}${config.postEndpoint}`, postData);
  return response.data;
};

const publishToLinkedIn = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  const config = PLATFORM_CONFIGS.linkedin;
  
  // Get user profile first
  const profileResponse = await axios.get(`${config.baseUrl}${config.userEndpoint}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const postData: any = {
    author: `urn:li:person:${profileResponse.data.id}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: {
          text: content
        },
        shareMediaCategory: 'NONE'
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };
  
  if (mediaUrl) {
    postData.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'IMAGE';
    postData.specificContent['com.linkedin.ugc.ShareContent'].media = [{
      status: 'READY',
      originalUrl: mediaUrl
    }];
  }
  
  const response = await axios.post(`${config.baseUrl}${config.postEndpoint}`, postData, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
};

const publishToYouTube = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  if (!mediaUrl) {
    throw new Error('YouTube requires video content');
  }
  
  const config = PLATFORM_CONFIGS.youtube;
  
  const postData = {
    snippet: {
      title: content.substring(0, 100),
      description: content,
      tags: [],
      categoryId: '22'
    },
    status: {
      privacyStatus: 'public'
    }
  };
  
  const response = await axios.post(`${config.baseUrl}${config.postEndpoint}`, postData, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    params: {
      part: 'snippet,status'
    }
  });
  
  return response.data;
};

/**
 * Safe decrypt function that handles both encrypted and plain tokens
 */
function safeDecrypt(token: string): string {
  if (!token) {
    throw new Error('Token is empty or undefined');
  }

  try {
    return decrypt(token);
  } catch (error: any) {
    console.warn('[Token] Decryption failed, using token as plain text:', error.message);
    return token;
  }
}

/**
 * Validate token by making a lightweight API call
 */
async function validateToken(platform: string, accessToken: string): Promise<boolean> {
  try {
    const decryptedToken = safeDecrypt(accessToken);
    
    const validationEndpoints: Record<string, string> = {
      tiktok: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id'
    };

    const endpoint = validationEndpoints[platform];
    if (!endpoint) return true;

    const response = await axios.get(endpoint, {
      headers: { 
        'Authorization': `Bearer ${decryptedToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 5000
    });

    return response.status === 200;
  } catch (error: any) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      return false;
    }
    return true;
  }
}

/**
 * Refresh access token for TikTok
 */
async function refreshTikTokToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const clientId = process.env.TIKTOK_CLIENT_ID;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  try {
    const decryptedRefreshToken = safeDecrypt(refreshToken);
    
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: clientId!,
        client_secret: clientSecret!,
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        }
      }
    );

    if (response.data.data) {
      return {
        access_token: response.data.data.access_token,
        expires_in: response.data.data.expires_in,
        refresh_token: response.data.data.refresh_token
      };
    }
    
    return {
      access_token: response.data.access_token,
      expires_in: response.data.expires_in || 3600,
      refresh_token: response.data.refresh_token
    };
  } catch (error: any) {
    throw new Error(`Token refresh failed for TikTok: ${error.response?.data?.error_description || error.message}`);
  }
}

const publishToTikTok = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  console.log('[tiktok] Starting publish process');
  console.log('[tiktok] Has media URL:', !!mediaUrl);
  
  if (!mediaUrl) {
    throw new Error('TikTok requires video content. Please upload a video file.');
  }
  
  try {
    // Get video file from R2
    console.log('[tiktok] Fetching video from R2...');
    const signedUrl = await getSignedUrlForFile(mediaUrl);
    console.log('[tiktok] Signed URL obtained:', signedUrl ? 'Yes' : 'No');
    
    const videoResponse = await axios.get(signedUrl, { 
      responseType: 'arraybuffer',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 30000
    });
    
    console.log('[tiktok] Video response status:', videoResponse.status);
    console.log('[tiktok] Video response data length:', videoResponse.data?.byteLength || 'undefined');
    
    if (!videoResponse.data) {
      throw new Error('Failed to fetch video from storage. Video data is empty.');
    }
    
    const videoBuffer = Buffer.from(videoResponse.data);
    console.log('[tiktok] Video fetched successfully, size:', videoBuffer.length, 'bytes');
    
    if (videoBuffer.length === 0) {
      throw new Error('Video file is empty');
    }
    
    // Step 1: Initialize INBOX upload (uses video.upload scope)
    console.log('[TikTok] Initializing INBOX upload...');
    const initResponse = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
      {
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: videoBuffer.length,
          chunk_size: videoBuffer.length,
          total_chunk_count: 1
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        }
      }
    );
    
    console.log('[TikTok] Init response status:', initResponse.status);
    
    const { publish_id, upload_url } = initResponse.data.data;
    
    if (!upload_url) {
      throw new Error('TikTok did not return an upload URL');
    }
    
    console.log('[TikTok] Got publish_id:', publish_id);
    
    // Step 2: Upload video file
    console.log('[TikTok] Uploading video to TikTok...');
    await axios.put(upload_url, videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBuffer.length.toString(),
        'Content-Range': `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('[TikTok] Video uploaded successfully to inbox!');
    console.log('[TikTok] User will receive notification in TikTok app to review and post');
    
    return { 
      publish_id, 
      status: 'Uploaded to Inbox', 
      message: `Video uploaded to TikTok inbox successfully! User needs to open TikTok app to review and post the video. Title suggestion: "${content.substring(0, 100)}"`
    };
  } catch (error: any) {
    console.error('[TikTok] Publishing failed:', error.message);
    console.error('[TikTok] Error details:', error.response?.data || error);
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('TikTok authentication failed - token may be expired. Please reconnect your TikTok account.');
    }
    
    throw new Error(`TikTok publishing failed: ${error.response?.data?.error?.message || error.message}`);
  }
};

export const publishToSocial = async (
  platform: string, 
  accessToken: string, 
  content: string, 
  mediaUrl?: string
): Promise<any> => {
  console.log(`\n[${platform}] Starting publish process`);
  console.log(`[${platform}] Has media URL:`, !!mediaUrl);
  
  if (!accessToken) {
    throw new Error(`No access token found for ${platform}`);
  }
  
  const decryptedToken = safeDecrypt(accessToken);
  
  try {
    let result;
    
    switch (platform) {
      case 'instagram':
        result = await publishToInstagram(decryptedToken, content, mediaUrl);
        break;
      case 'facebook':
        result = await publishToFacebook(decryptedToken, content, mediaUrl);
        break;
      case 'linkedin':
        result = await publishToLinkedIn(decryptedToken, content, mediaUrl);
        break;
      case 'youtube':
        result = await publishToYouTube(decryptedToken, content, mediaUrl);
        break;
      case 'tiktok':
        result = await publishToTikTok(decryptedToken, content, mediaUrl);
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    
    console.log(`[${platform}] Publish successful`);
    return result;
  } catch (error: any) {
    console.error(`[${platform}] Publish error:`, error.message);
    console.error(`[${platform}] Error stack:`, error.stack);
    throw error;
  }
};

export const refreshTokenIfNeeded = async (socialAccount: any): Promise<any> => {
  const platform = socialAccount.platform;
  console.log(`\n[Token Management] Checking token for ${platform}...`);
  
  // Check if token is expired or about to expire (within 1 hour)
  const isExpired = socialAccount.expiresAt && 
    new Date(socialAccount.expiresAt).getTime() - Date.now() < 3600000;

  if (isExpired) {
    console.log(`[Token Management] ${platform} token is expired or expiring soon`);
  } else {
    console.log(`[Token Management] ${platform} token expiry:`, socialAccount.expiresAt || 'No expiry set');
  }

  // If token is expired and we have a refresh token, try to refresh
  if (isExpired && socialAccount.refreshToken && platform === 'tiktok') {
    console.log(`[Token Management] Attempting to refresh ${platform} token...`);
    
    try {
      const newTokens = await refreshTikTokToken(socialAccount.refreshToken);
      
      const updatedAccount = await SocialAccount.update(socialAccount.id, {
        accessToken: encrypt(newTokens.access_token),
        refreshToken: newTokens.refresh_token ? encrypt(newTokens.refresh_token) : socialAccount.refreshToken,
        expiresAt: new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
      });
      
      console.log(`[Token Management] ${platform} token refreshed successfully`);
      return updatedAccount;
    } catch (error: any) {
      console.error(`[Token Management] Failed to refresh ${platform} token:`, error.message);
      
      // If refresh fails, validate the existing token
      console.log(`[Token Management] Validating existing ${platform} token...`);
      const isValid = await validateToken(platform, socialAccount.accessToken);
      
      if (!isValid) {
        throw new Error(
          `${platform} token is invalid and refresh failed. Please reconnect your ${platform} account.`
        );
      }
      
      console.log(`[Token Management] Existing ${platform} token is still valid`);
      return socialAccount;
    }
  }

  // Token not expired - validate it's still working for TikTok
  if (platform === 'tiktok') {
    console.log(`[Token Management] Validating ${platform} token...`);
    const isValid = await validateToken(platform, socialAccount.accessToken);
    
    if (!isValid && socialAccount.refreshToken) {
      console.log(`[Token Management] ${platform} token invalid, attempting refresh...`);
      
      try {
        const newTokens = await refreshTikTokToken(socialAccount.refreshToken);
        
        const updatedAccount = await SocialAccount.update(socialAccount.id, {
          accessToken: encrypt(newTokens.access_token),
          refreshToken: newTokens.refresh_token ? encrypt(newTokens.refresh_token) : socialAccount.refreshToken,
          expiresAt: new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
        });
        
        console.log(`[Token Management] ${platform} token refreshed after validation failure`);
        return updatedAccount;
      } catch (error: any) {
        throw new Error(
          `${platform} token is invalid and refresh failed. Please reconnect your ${platform} account.`
        );
      }
    } else if (!isValid) {
      throw new Error(
        `${platform} token is invalid and no refresh token available. Please reconnect your ${platform} account.`
      );
    }

    console.log(`[Token Management] ${platform} token is valid`);
  }

  return socialAccount;
};
