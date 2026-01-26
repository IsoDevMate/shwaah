# OAuth Integration Issues - Social Media Publisher

## Current Problem
Our multi-platform social media publisher is experiencing OAuth authentication failures, particularly with Instagram and YouTube. We need help debugging and fixing these integration issues.

## Background Context

### What We're Building
- Multi-platform social media publisher supporting Instagram, Facebook, LinkedIn, YouTube, and TikTok
- Users authenticate via OAuth to connect their social accounts
- App publishes content simultaneously across connected platforms

### Recent Changes Made
1. **Instagram API Migration**: Migrated from deprecated Instagram Basic Display API (discontinued Dec 4, 2024) to Instagram API with Instagram Login
2. **Updated OAuth Scopes**: Changed to new business scopes (`instagram_business_basic`, `instagram_business_content_publish`)
3. **Enhanced Logging**: Added detailed error logging to debug OAuth flow

## Current OAuth Configuration

### Instagram (NEW API)
```javascript
// Updated scopes for Instagram API with Instagram Login
instagram: 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments'

// OAuth URL
https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&state=${userId}

// Token Exchange URL
https://api.instagram.com/oauth/access_token

// User Info URL  
https://graph.instagram.com/me?fields=id,username
```

### YouTube
```javascript
// Scopes
youtube: 'https://www.googleapis.com/auth/youtube.upload'

// OAuth URL
https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code&access_type=offline&state=${userId}
```

### Environment Configuration
```bash
# Instagram API credentials (NEW - not Basic Display)
INSTAGRAM_CLIENT_ID="1247333992906653"
INSTAGRAM_CLIENT_SECRET="93e82a3f6484b2d9636fcb59fcbf5a5a"

# YouTube
YOUTUBE_CLIENT_ID="124326887396-vg53kkpmj9364ja6b3r5ffrp2lpmu6rv.apps.googleusercontent.com"
YOUTUBE_CLIENT_SECRET="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"

# Redirect URIs
REDIRECT_URI=https://shwaah.onrender.com/api/social/callback
```

## Specific Errors Encountered

### Instagram Error
```
Invalid Request: Request parameters are invalid: Invalid platform app
```
- **Likely Cause**: Using wrong app type or credentials from deprecated Basic Display API
- **Status**: Migrated to Instagram API but still getting errors

### YouTube Error
```json
{
  "error": "Request failed with status code 400",
  "data": {
    "error": "redirect_uri_mismatch",
    "error_description": "Bad Request"
  }
}
```
- **Likely Cause**: Redirect URI mismatch in Google Cloud Console
- **Expected URI**: `https://shwaah.onrender.com/api/social/callback/youtube`

## Code Structure

### OAuth Flow Implementation
```javascript
// 1. Generate OAuth URL
router.get('/connect/:platform', authenticateUser, async (req, res) => {
  const authUrl = getAuthUrl(platform, req.user.id);
  return sendSuccess(req, res, { authUrl });
});

// 2. Handle OAuth callback
router.get('/callback/:platform', async (req, res) => {
  const { code, state: userId, error } = req.query;
  
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(platform, code);
  
  // Get user info
  const userInfo = await getPlatformUserInfo(platform, tokens.access_token);
  
  // Save to database
  await SocialAccount.upsert({...});
});
```

### Enhanced Logging Added
```javascript
// Detailed OAuth callback logging
logger.info(`OAuth callback for ${platform}`, { 
  code: code ? 'present' : 'missing',
  userId,
  error,
  error_description,
  query: req.query 
});

// Token exchange logging
logger.error(`Token exchange failed for ${platform}`, {
  error: error.message,
  status: error.response?.status,
  data: error.response?.data,
  requestData: { ...tokenData[platform], client_secret: '[HIDDEN]' }
});
```

## What We Need Help With

1. **Instagram Setup Verification**: 
   - Confirm correct app configuration in Meta Developer Console
   - Verify we're using Instagram API (not Basic Display) credentials
   - Check if app needs to be in "Live" mode vs "Development"

2. **YouTube Redirect URI Fix**:
   - Exact redirect URI format needed in Google Cloud Console
   - Any additional OAuth 2.0 settings required

3. **General OAuth Debugging**:
   - Best practices for debugging OAuth flows
   - Common configuration mistakes to avoid
   - How to test OAuth flows in development vs production

## Current App Status
- **Environment**: Development (local) + Production (Render.com)
- **Database**: Turso (SQLite)
- **Framework**: Express.js + TypeScript
- **Logging**: Winston with daily rotation
- **OAuth Libraries**: Axios for HTTP requests, custom implementation

## Next Steps Needed
1. Fix Instagram app configuration in Meta Console
2. Correct YouTube redirect URI in Google Console  
3. Test OAuth flows with enhanced logging
4. Verify all platform integrations work end-to-end

---

**Note**: Instagram Basic Display API was deprecated on December 4, 2024. All Instagram integrations must now use Instagram API with Instagram Login or Instagram API with Facebook Login.
