import { Request } from 'express';

// Minimal User interface for authentication context
export interface AuthUser {
  id: string; // Changed from number to string for UUID
  email: string;
  name: string;
  password?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface PublishResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  // TikTok specific fields
  open_id?: string;
  scope?: string;
  token_type?: string;
}

export interface PlatformUserInfo {
  id: string;
  username?: string;
  name?: string;
}

export interface PostDB {
  id: string;
  userId: string;
  content: string;
  mediaUrls: string[];
  platforms: string[];
  platformContent?: Record<string, { content?: string; hashtags?: string }> | null;
  status: string;
  publishResults: any;
  scheduledAt?: string;
  campaignId?: string;
  createdAt: string;
  updatedAt: string;
}

// These are original interfaces from the file, keeping them
export interface SocialAccount {
  id: string; // Changed from number to string for UUID
  user_id: string; // Changed from number to string for UUID
  platform: 'instagram' | 'tiktok' | 'youtube';
  account_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

export interface Post {
  id: string; // Changed from number to string for UUID
  user_id: string; // Changed from number to string for UUID
  content: string;
  media_urls: string[];
  platforms: string[];
  scheduled_at: string;
  status: 'scheduled' | 'posted' | 'failed';
  created_at: string;
}

export interface Campaign {
  id: string; // Changed from number to string for UUID
  user_id: string; // Changed from number to string for UUID
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}


