export interface User {
  id: number;
  email: string;
  password: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialAccount {
  id: number;
  userId: number;
  platform: 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok';
  platformUserId: string;
  platformUsername?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: number;
  userId: number;
  content: string;
  mediaUrls?: string[]; // Changed to array for multiple files
  platforms: string[];
  status: 'pending' | 'published' | 'failed' | 'scheduled';
  publishResults?: Record<string, any>;
  scheduledAt?: Date;
  campaignId?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest extends Request {
  user?: User;
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
}

export interface PlatformUserInfo {
  id: string;
  username?: string;
  name?: string;
}

export interface Campaign {
  id: number;
  userId: number;
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  status: 'active' | 'paused' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

export interface Analytics {
  id: number;
  postId: number;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  engagementRate: number;
  recordedAt: Date;
}
