import axios from 'axios';
import { decrypt, encrypt } from '../utils/crypto';
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
    baseUrl: 'https://open-api.tiktok.com',
    postEndpoint: '/share/video/upload/',
    userEndpoint: '/user/info/'
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
  if (!mediaUrl) {
    throw new Error('TikTok requires video content');
  }
  
  const config = PLATFORM_CONFIGS.tiktok;
  
  const postData = {
    video_url: mediaUrl,
    text: content,
    privacy_level: 'PUBLIC_TO_EVERYONE'
  };
  
  const response = await axios.post(`${config.baseUrl}${config.postEndpoint}`, postData, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
};

export const publishToSocial = async (
  platform: string, 
  accessToken: string, 
  content: string, 
  mediaUrl?: string
): Promise<any> => {
  const decryptedToken = decrypt(accessToken);
  
  switch (platform) {
    case 'instagram':
      return await publishToInstagram(decryptedToken, content, mediaUrl);
    case 'facebook':
      return await publishToFacebook(decryptedToken, content, mediaUrl);
    case 'linkedin':
      return await publishToLinkedIn(decryptedToken, content, mediaUrl);
    case 'youtube':
      return await publishToYouTube(decryptedToken, content, mediaUrl);
    case 'tiktok':
      return await publishToTikTok(decryptedToken, content, mediaUrl);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
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
