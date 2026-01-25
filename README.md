# Social Media Publisher

Multi-platform social media publisher supporting TikTok, Instagram, LinkedIn, YouTube, and Facebook.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `.env`:
```bash
# Copy and update with your OAuth credentials
cp .env.example .env
```

3. Build and start:
```bash
npm run build
npm start
```

For development:
```bash
npm run dev
```

## OAuth Setup

### Instagram
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create app and get Instagram Basic Display credentials
3. Add redirect URI: `http://localhost:3000/api/social/callback/instagram`

### Facebook
1. Same as Instagram - use Facebook Login product
2. Add redirect URI: `http://localhost:3000/api/social/callback/facebook`

### LinkedIn
1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Create app and get OAuth 2.0 credentials
3. Add redirect URI: `http://localhost:3000/api/social/callback/linkedin`

### YouTube
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable YouTube Data API v3
3. Create OAuth 2.0 credentials
4. Add redirect URI: `http://localhost:3000/api/social/callback/youtube`

### TikTok
1. Go to [TikTok Developers](https://developers.tiktok.com/)
2. Create app and get Login Kit credentials
3. Add redirect URI: `http://localhost:3000/api/social/callback/tiktok`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user

### Social Accounts
- `GET /api/social/accounts` - Get connected accounts
- `GET /api/social/connect/:platform` - Get OAuth URL
- `DELETE /api/social/disconnect/:platform` - Disconnect account

### Posts
- `POST /api/posts/create` - Create post (with media upload)
- `POST /api/posts/publish/:postId` - Publish to selected platforms
- `GET /api/posts/my-posts` - Get user posts
- `DELETE /api/posts/:postId` - Delete post

## Usage Flow

1. Register/Login user
2. Connect social platforms via OAuth
3. Create post with content and media
4. Publish to selected connected platforms simultaneously

## Features

- ✅ Multi-platform publishing (Instagram, Facebook, LinkedIn, YouTube, TikTok)
- ✅ OAuth authentication for all platforms
- ✅ Token encryption and refresh
- ✅ Media upload support
- ✅ Simultaneous publishing
- ✅ Publishing status tracking
- ✅ TypeScript support
