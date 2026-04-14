import { Router } from 'express';
import axios from 'axios';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { SocialAccount } from '../models/tursoModels';
import { decrypt } from '../utils/crypto';
import { refreshTokenIfNeeded } from '../services/socialService';
import { buildHealthReport } from '../services/healthScoreService';

const router = Router();
router.use(authenticateUser);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const accounts = await SocialAccount.findByUser(req.user!.id);

    if (!accounts.length) {
      return ResponseUtil.success(res, 200, {
        overallScore: 0, grade: 'F', platforms: [],
        summary: 'No connected platforms. Connect at least one social account to get your health score.',
      }, 'Health score retrieved');
    }

    // Fetch live metrics (same logic as /api/social/metrics)
    const liveMetrics: Record<string, any> = {};
    await Promise.all(accounts.map(async (account: any) => {
      const platform = String(account.platform);
      try {
        const fresh = await refreshTokenIfNeeded(account).catch(() => account);
        const token = (() => { try { return decrypt(String(fresh.accessToken)); } catch { return String(fresh.accessToken); } })();

        if (platform === 'instagram') {
          // Basic Display API — bio not available without Graph API (Business account)
          const r = await axios.get('https://graph.instagram.com/me', {
            params: { fields: 'id,username,followers_count,media_count', access_token: token }
          });
          liveMetrics[platform] = {
            username: r.data.username,
            followers: r.data.followers_count ?? 0,
            posts: r.data.media_count ?? 0,
            bio: null,
            bioUnavailable: true, // requires Instagram Graph API (Business account)
          };
        } else if (platform === 'tiktok') {
          const r = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
            params: { fields: 'display_name,follower_count,video_count,bio_description' },
            headers: { Authorization: `Bearer ${token}` }
          });
          const u = r.data?.data?.user ?? {};
          liveMetrics[platform] = {
            username: u.display_name,
            followers: u.follower_count ?? 0,
            posts: u.video_count ?? 0,
            bio: u.bio_description ?? null,
          };
        } else if (platform === 'linkedin') {
          const r = await axios.get('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } });
          liveMetrics[platform] = {
            username: r.data.name,
            bio: null,
            bioUnavailable: true, // requires LinkedIn Partner API
          };
        } else if (platform === 'youtube') {
          const r = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
            params: { part: 'snippet,statistics', mine: true },
            headers: { Authorization: `Bearer ${token}` }
          });
          const ch = r.data?.items?.[0];
          liveMetrics[platform] = {
            username: ch?.snippet?.title,
            subscribers: Number(ch?.statistics?.subscriberCount ?? 0),
            bio: ch?.snippet?.description ?? null,
          };
        } else if (platform === 'facebook') {
          const r = await axios.get('https://graph.facebook.com/me', { params: { fields: 'id,name', access_token: token } });
          liveMetrics[platform] = {
            username: r.data.name,
            bio: null,
            bioUnavailable: true, // requires Page connection
          };
        }
      } catch {
        liveMetrics[platform] = { error: true };
      }
    }));

    const report = await buildHealthReport(req.user!.id, liveMetrics);
    return ResponseUtil.success(res, 200, report, 'Health score retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

export default router;
