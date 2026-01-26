import { Request } from 'express';

// Minimal User interface for authentication context
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  password?: string; // Password might be present but often omitted for security in context
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
  id: number;
  userId: number;
  content: string;
  mediaUrls: string[];
  platforms: string[];
  status: string;
  publishResults: any; // Can be more specific if needed
  scheduledAt?: string; // or Date, depending on how it's handled after retrieval
  campaignId?: number;
  createdAt: string;
  updatedAt: string;
}

// These are original interfaces from the file, keeping them
export interface SocialAccount {
  id: number;
  user_id: number;
  platform: 'instagram' | 'tiktok' | 'youtube';
  account_id: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

export interface Post {
  id: number;
  user_id: number;
  content: string;
  media_urls: string[];
  platforms: string[];
  scheduled_at: string;
  status: 'scheduled' | 'posted' | 'failed';
  created_at: string;
}

export interface Campaign {
  id: number;
  user_id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}


