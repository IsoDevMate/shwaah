export interface User {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

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
