import axios from 'axios';
import { SocialAccount } from '../types';

export class InstagramAPI {
  async post(account: SocialAccount, content: string, mediaUrls: string[]) {
    try {
      // Instagram Basic Display API posting
      const response = await axios.post(
        `https://graph.instagram.com/v18.0/${account.account_id}/media`,
        {
          image_url: mediaUrls[0],
          caption: content,
          access_token: account.access_token
        }
      );
      
      // Publish the media
      await axios.post(
        `https://graph.instagram.com/v18.0/${account.account_id}/media_publish`,
        {
          creation_id: response.data.id,
          access_token: account.access_token
        }
      );
      
      return { success: true, id: response.data.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class TikTokAPI {
  async post(account: SocialAccount, content: string, mediaUrls: string[]) {
    try {
      // TikTok API posting (placeholder - requires TikTok for Developers)
      const response = await axios.post(
        'https://open-api.tiktok.com/share/video/upload/',
        {
          video_url: mediaUrls[0],
          text: content,
          access_token: account.access_token
        }
      );
      
      return { success: true, id: response.data.share_id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export class YouTubeAPI {
  async post(account: SocialAccount, content: string, mediaUrls: string[]) {
    try {
      // YouTube Data API v3 posting
      const response = await axios.post(
        'https://www.googleapis.com/upload/youtube/v3/videos',
        {
          snippet: {
            title: content.split('\n')[0] || 'Untitled',
            description: content,
            tags: [],
            categoryId: '22'
          },
          status: {
            privacyStatus: 'public'
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { success: true, id: response.data.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
