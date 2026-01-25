import cron from 'node-cron';
import db from '../database';
import { InstagramAPI, TikTokAPI, YouTubeAPI } from './social-apis';
import { Post, SocialAccount } from '../types';

class PostScheduler {
  private instagram = new InstagramAPI();
  private tiktok = new TikTokAPI();
  private youtube = new YouTubeAPI();

  constructor() {
    // Check for scheduled posts every minute
    cron.schedule('* * * * *', () => {
      this.processScheduledPosts();
    });
  }

  private async processScheduledPosts() {
    const now = new Date().toISOString();
    const posts = await db.query(
      'SELECT * FROM posts WHERE scheduled_at <= ? AND status = "scheduled"',
      [now]
    );

    for (const post of posts) {
      await this.publishPost(post);
    }
  }

  private async publishPost(post: Post) {
    const platforms = JSON.parse(post.platforms as any);
    const mediaUrls = JSON.parse(post.media_urls as any);
    
    for (const platform of platforms) {
      const accounts = await db.query(
        'SELECT * FROM social_accounts WHERE user_id = ? AND platform = ?',
        [post.user_id, platform]
      );

      for (const account of accounts) {
        const result = await this.postToPlatform(platform, account, post.content, mediaUrls);
        
        if (result.success) {
          console.log(`Posted to ${platform} successfully`);
        } else {
          console.error(`Failed to post to ${platform}:`, result.error);
        }
      }
    }

    await db.run('UPDATE posts SET status = "posted" WHERE id = ?', [post.id]);
  }

  private async postToPlatform(platform: string, account: SocialAccount, content: string, mediaUrls: string[]) {
    switch (platform) {
      case 'instagram':
        return this.instagram.post(account, content, mediaUrls);
      case 'tiktok':
        return this.tiktok.post(account, content, mediaUrls);
      case 'youtube':
        return this.youtube.post(account, content, mediaUrls);
      default:
        return { success: false, error: 'Unknown platform' };
    }
  }
}

export default new PostScheduler();
