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
    postEndpoint: '/v2/post/publish/video/init/',
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

const publishToTikTok = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  console.log('[TikTok] Starting publish process');
  console.log('[TikTok] Media URL:', mediaUrl);
  
  if (!mediaUrl) {
    throw new Error('TikTok requires video content. Please upload a video file.');
  }
  
  try {
    // Get video file from R2
    console.log('[TikTok] Fetching video from R2...');
    const signedUrl = await getSignedUrlForFile(mediaUrl);
    console.log('[TikTok] Signed URL obtained');
    
    const videoResponse = await axios.get(signedUrl, { 
      responseType: 'arraybuffer',
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    if (!videoResponse.data) {
      throw new Error('Failed to fetch video from storage. Video data is empty.');
    }
    
    const videoBuffer = Buffer.from(videoResponse.data);
    console.log('[TikTok] Video fetched successfully, size:', videoBuffer.length, 'bytes');
    
    if (videoBuffer.length === 0) {
      throw new Error('Video file is empty');
    }
    
    // Step 1: Initialize upload
    console.log('[TikTok] Initializing upload...');
    const initResponse = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      {
        post_info: {
          title: content.substring(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000
        },
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
    
    console.log('[TikTok] Init response:', JSON.stringify(initResponse.data, null, 2));
    
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
    
    console.log('[TikTok] Video uploaded successfully');
    
    return { publish_id, status: 'Processing', message: 'Video uploaded successfully and is being processed by TikTok' };
  } catch (error: any) {
    console.error('[TikTok] Publishing failed:', error.message);
    console.error('[TikTok] Error details:', error.response?.data || error);
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
  
  const decryptedToken = decrypt(accessToken);
  
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
  if (!socialAccount.expiresAt || new Date() < new Date(socialAccount.expiresAt)) {
    return socialAccount;
  }
  
  const refreshEndpoints: Record<string, string> = {
    instagram: 'https://graph.instagram.com/refresh_access_token',
    facebook: 'https://graph.facebook.com/oauth/access_token',
    linkedin: 'https://www.linkedin.com/oauth/v2/accessToken',
    youtube: 'https://oauth2.googleapis.com/token',
    tiktok: 'https://open-api.tiktok.com/oauth/refresh_token/'
  };
  
  const endpoint = refreshEndpoints[socialAccount.platform];
  if (!endpoint) return socialAccount;
  
  try {
    const response = await axios.post(endpoint, {
      grant_type: 'refresh_token',
      refresh_token: decrypt(socialAccount.refreshToken!),
      client_id: process.env[`${socialAccount.platform.toUpperCase()}_CLIENT_ID`],
      client_secret: process.env[`${socialAccount.platform.toUpperCase()}_CLIENT_SECRET`]
    });
    
    const { access_token, expires_in } = response.data;
    
    // Update in database using Turso models
    const { SocialAccount } = await import('../models/tursoModels');
    const updatedAccount = await SocialAccount.update(socialAccount.id, {
      accessToken: encrypt(access_token),
      expiresAt: new Date(Date.now() + expires_in * 1000).toISOString()
    });
    
    return updatedAccount;
  } catch (error) {
    console.error(`Failed to refresh token for ${socialAccount.platform}:`, (error as Error).message);
    return socialAccount;
  }
};
