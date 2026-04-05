# Project Context

## Working Features — DO NOT TOUCH

The following are confirmed working and must not be modified:

- **Media upload (photos & videos)** — R2 upload via multer-s3, public URL generation using `R2_PUBLIC_URL` priority in `src/routes/posts.ts`
- **Post creation** (`POST /api/posts/create`) — correctly stores public R2 URLs in `mediaUrls`
- **TikTok publishing** — video upload to inbox works end-to-end
- **Instagram publishing** — photo and video (REELS) publishing works with public R2 URLs
- **OAuth & token management** — connect/disconnect/refresh flows for all platforms
- **Token encryption/decryption**

## Development Rules

- Any new logic must **build on top of** existing working code, never refactor or restructure it
- Do not modify working route handlers, service functions, or utility files unless a bug is explicitly confirmed
- Preserve all existing console.log patterns for debugging continuity

## Current Focus

- Testing and validating the **post scheduling** feature
- Scheduled posts use `status: "scheduled"` and a `scheduledAt` timestamp
- The scheduler runs via a cron job — see existing scheduler logic
