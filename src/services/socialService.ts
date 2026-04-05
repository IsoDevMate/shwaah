import axios from 'axios';
import { decrypt, encrypt } from '../utils/crypto';
import { SocialAccount } from '../models/tursoModels';

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

const isVideo = (url: string) => /\.(mp4|mov|avi|mkv|webm)(\?|$)/i.test(url);

async function retryPost<T>(fn: () => Promise<T>, retries = 3, delayMs = 4000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient = err.response?.data?.error?.is_transient === true;
      if (!isTransient || i === retries - 1) throw err;
      console.log(`[Instagram] Transient error, retrying in ${delayMs / 1000}s... (attempt ${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('retryPost exhausted');
}

const publishToInstagram = async (accessToken: string, content: string, mediaUrl?: string, mediaUrls?: string[]): Promise<any> => {
  const config = PLATFORM_CONFIGS.instagram;
  
  if (!mediaUrl) {
    throw new Error('Instagram requires media content');
  }

  try {
    const allUrls = mediaUrls && mediaUrls.length > 1 ? mediaUrls : [mediaUrl];
    const mediaIsVideo = isVideo(mediaUrl);

    // Carousel post (multiple images)
    if (allUrls.length > 1) {
      const hasVideo = allUrls.some(isVideo);
      const hasImage = allUrls.some(u => !isVideo(u));
      if (hasVideo && hasImage) {
        throw new Error('Instagram does not support mixing videos and images in a carousel. Use either all images or a single video.');
      }

      console.log(`[Instagram] Creating carousel with ${allUrls.length} items`);
      
      // Create a container for each image
      const containerIds = await Promise.all(allUrls.map(async (url) => {
        const isVid = isVideo(url);
        const params: any = { access_token: accessToken, is_carousel_item: true };
        if (isVid) { params.media_type = 'VIDEO'; params.video_url = url; }
        else { params.image_url = url; }
        const res = await axios.post(`${config.baseUrl}${config.postEndpoint}`, params);
        return res.data.id;
      }));

      console.log('[Instagram] Carousel item containers:', containerIds);

      // Create carousel container
      const carouselRes = await retryPost(() => axios.post(`${config.baseUrl}${config.postEndpoint}`, {
        media_type: 'CAROUSEL',
        children: containerIds.join(','),
        caption: content,
        access_token: accessToken
      }));

      const carouselId = carouselRes.data.id;

      // Poll until ready
      let status = 'IN_PROGRESS';
      let attempts = 0;
      while (status === 'IN_PROGRESS' && attempts < 15) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await axios.get(`${config.baseUrl}/${carouselId}`, {
          params: { fields: 'status_code', access_token: accessToken }
        });
        status = statusRes.data.status_code;
        attempts++;
        console.log(`[Instagram] Carousel status: ${status} (attempt ${attempts})`);
      }

      const publishResponse = await retryPost(() => axios.post(`${config.baseUrl}/me/media_publish`, {
        creation_id: carouselId,
        access_token: accessToken
      }));

      return publishResponse.data;
    }
    console.log('[Instagram] Creating media container with:', { mediaUrl, isVideo: mediaIsVideo, caption: content });

    // Build container params based on media type
    const containerParams: any = {
      caption: content,
      access_token: accessToken
    };

    if (mediaIsVideo) {
      containerParams.media_type = 'REELS';
      containerParams.video_url = mediaUrl;
    } else {
      containerParams.image_url = mediaUrl;
    }

    const mediaResponse = await axios.post(`${config.baseUrl}${config.postEndpoint}`, containerParams);
    console.log('[Instagram] Media container created:', mediaResponse.data);

    // Poll until ready before publishing (both photos and videos)
    const containerId = mediaResponse.data.id;
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = mediaIsVideo ? 20 : 10; // Videos take longer
    const pollInterval = mediaIsVideo ? 5000 : 2000; // 5s for video, 2s for photo

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, pollInterval));
      const statusRes = await axios.get(`${config.baseUrl}/${containerId}`, {
        params: { fields: 'status_code', access_token: accessToken }
      });
      status = statusRes.data.status_code;
      attempts++;
      console.log(`[Instagram] ${mediaIsVideo ? 'Video' : 'Photo'} processing status: ${status} (attempt ${attempts})`);
    }
    
    if (status !== 'FINISHED') {
      throw new Error(`Instagram media processing failed with status: ${status}`);
    }

    // Publish media
    const publishResponse = await retryPost(() => axios.post(`${config.baseUrl}/me/media_publish`, {
      creation_id: mediaResponse.data.id,
      access_token: accessToken
    }));
    
    return publishResponse.data;
  } catch (error: any) {
    console.error('[Instagram] Publish failed:', error.response?.data || error.message);
    console.error('[Instagram] Full error:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
};

const publishToFacebook = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  if (mediaUrl && isVideo(mediaUrl)) {
    // Video upload to Facebook
    const response = await axios.post('https://graph-video.facebook.com/me/videos', {
      description: content,
      file_url: mediaUrl,
      access_token: accessToken
    });
    return response.data;
  }

  if (mediaUrl && !isVideo(mediaUrl)) {
    // Photo upload
    const response = await axios.post('https://graph.facebook.com/me/photos', {
      caption: content,
      url: mediaUrl,
      access_token: accessToken
    });
    return response.data;
  }

  // Text-only post
  const response = await axios.post('https://graph.facebook.com/me/feed', {
    message: content,
    access_token: accessToken
  });
  return response.data;
};

const publishToLinkedIn = async (accessToken: string, content: string, mediaUrl?: string): Promise<any> => {
  // Get author URN from userinfo
  const profileRes = await axios.get('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const authorUrn = `urn:li:person:${profileRes.data.sub}`;

  // Text-only post
  if (!mediaUrl) {
    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    return response.data;
  }

  const mediaIsVideo = isVideo(mediaUrl);

  if (mediaIsVideo) {
    // Step 1: Register upload
    const registerRes = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-video'],
        owner: authorUrn,
        serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }]
      }
    }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });

    const uploadUrl = registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
    const asset = registerRes.data.value.asset;

    // Step 2: Fetch video and upload
    const videoRes = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
    await axios.put(uploadUrl, videoRes.data, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }
    });

    // Step 3: Post with video asset
    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory: 'VIDEO',
          media: [{ status: 'READY', media: asset }]
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
    return response.data;
  }

  // Image post — register upload
  const registerRes = await axios.post('https://api.linkedin.com/v2/assets?action=registerUpload', {
    registerUploadRequest: {
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      owner: authorUrn,
      serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }]
    }
  }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });

  const uploadUrl = registerRes.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = registerRes.data.value.asset;

  const imgRes = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
  await axios.put(uploadUrl, imgRes.data, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' }
  });

  const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: 'IMAGE',
        media: [{ status: 'READY', media: asset, title: { localized: { en_US: content.substring(0, 100) } } }]
      }
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  }, { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });
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
    throw new Error('TikTok requires media content (photo or video).');
  }

  const mediaIsVideo = isVideo(mediaUrl);
  console.log('[TikTok] Media type:', mediaIsVideo ? 'VIDEO' : 'PHOTO');

  try {
    if (mediaIsVideo) {
      return await publishTikTokVideo(accessToken, content, mediaUrl);
    } else {
      return await publishTikTokPhoto(accessToken, content, mediaUrl);
    }
  } catch (error: any) {
    console.error('[TikTok] Publishing failed:', error.message);
    console.error('[TikTok] Error details:', error.response?.data || error.code || error);
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH') {
      throw new Error('Network timeout: Unable to connect to TikTok servers. Please try again.');
    }
    
    if (error.response?.data?.error?.code === 'scope_not_authorized') {
      throw new Error('TikTok scope error: Please disconnect and reconnect your TikTok account.');
    }
    
    throw error;
  }
};

const publishTikTokPhoto = async (accessToken: string, content: string, mediaUrl: string): Promise<any> => {
  console.log('[TikTok] Publishing photo via MEDIA_UPLOAD...');
  
  // Proxy through our own domain so TikTok can verify URL ownership
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `https://shwaah-8n4g.onrender.com`;
  const proxiedUrl = `${baseUrl}/api/media/proxy?url=${encodeURIComponent(mediaUrl)}`;
  console.log('[TikTok] Using proxied URL:', proxiedUrl);
  
  const response = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/content/init/',
    {
      post_info: {
        title: content.substring(0, 90),
        description: content.substring(0, 4000)
      },
      source_info: {
        source: 'PULL_FROM_URL',
        photo_cover_index: 0,
        photo_images: [proxiedUrl]
      },
      post_mode: 'MEDIA_UPLOAD',
      media_type: 'PHOTO'
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }
  );

  console.log('[TikTok] Photo uploaded to inbox successfully');
  
  return {
    publish_id: response.data.data.publish_id,
    status: 'Uploaded to Inbox',
    message: `Photo uploaded to TikTok inbox successfully! User needs to open TikTok app to review and post. Title: "${content.substring(0, 90)}"`
  };
};

const publishTikTokVideo = async (accessToken: string, content: string, mediaUrl: string): Promise<any> => {
  console.log('[tiktok] Fetching video from R2...');

  // Alternative: PULL_FROM_URL (requires verified domain in TikTok dashboard)
  // const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://shwaah-8n4g.onrender.com';
  // const proxiedUrl = `${baseUrl}/api/media/proxy?url=${encodeURIComponent(mediaUrl)}`;
  // const response = await axios.post('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
  //   { source_info: { source: 'PULL_FROM_URL', video_url: proxiedUrl } },
  //   { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
  // );
  // return { publish_id: response.data.data.publish_id, status: 'Uploaded to Inbox', message: '...' };

  const { getSignedUrlForFile } = await import('../utils/r2Storage');
  const signedUrl = await getSignedUrlForFile(mediaUrl);
  console.log('[tiktok] Signed URL obtained:', signedUrl ? 'Yes' : 'No');

  let videoResponse;
  let retries = 3;
  while (retries > 0) {
    try {
      videoResponse = await axios.get(signedUrl, {
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TikTokUploader/1.0)' }
      });
      break;
    } catch (fetchError: any) {
      retries--;
      console.warn(`[tiktok] Video fetch attempt failed (${3 - retries}/3):`, fetchError.code || fetchError.message);
      if (retries === 0) throw new Error(`Failed to fetch video from R2 after 3 attempts: ${fetchError.code || fetchError.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  const videoBuffer = Buffer.from(videoResponse!.data);
  console.log('[tiktok] Video fetched successfully, size:', videoBuffer.length, 'bytes');
  if (videoBuffer.length === 0) throw new Error('Video file is empty');

  console.log('[TikTok] Initializing INBOX upload...');
  const initResponse = await axios.post(
    'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
    { source_info: { source: 'FILE_UPLOAD', video_size: videoBuffer.length, chunk_size: videoBuffer.length, total_chunk_count: 1 } },
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' } }
  );

  const { publish_id, upload_url } = initResponse.data.data;
  if (!upload_url) throw new Error('TikTok did not return an upload URL');

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
  return {
    publish_id,
    status: 'Uploaded to Inbox',
    message: `Video uploaded to TikTok inbox successfully! User needs to open TikTok app to review and post the video. Title suggestion: "${content.substring(0, 100)}"`
  };
};

export const publishToSocial = async (
  platform: string, 
  accessToken: string, 
  content: string, 
  mediaUrl?: string,
  mediaUrls?: string[]
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
        result = await publishToInstagram(decryptedToken, content, mediaUrl, mediaUrls);
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
