import { SocialAccount } from '../types';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export abstract class OAuthProvider {
  constructor(protected config: OAuthConfig) {}
  
  abstract getAuthUrl(): string;
  abstract exchangeCodeForToken(code: string): Promise<{ accessToken: string; refreshToken?: string }>;
  abstract refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }>;
}

export class OAuthManager {
  private providers = new Map<string, OAuthProvider>();
  
  registerProvider(platform: string, provider: OAuthProvider) {
    this.providers.set(platform, provider);
  }
  
  getAuthUrl(platform: string): string {
    const provider = this.providers.get(platform);
    if (!provider) throw new Error(`No OAuth provider for ${platform}`);
    return provider.getAuthUrl();
  }
  
  async handleCallback(platform: string, code: string): Promise<SocialAccount> {
    const provider = this.providers.get(platform);
    if (!provider) throw new Error(`No OAuth provider for ${platform}`);
    
    const tokens = await provider.exchangeCodeForToken(code);
    return {
      id: 0,
      platform,
      account_id: '',
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
  }
}
