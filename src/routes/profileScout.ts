import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { creditGuard } from '../v2/guards/creditGuard';
import { scoutYouTube, scoutTikTok } from '../services/profileScoutService';
import { Database, generateUUID } from '../models';
import axios from 'axios';

const router = Router();
router.use(authenticateUser);

function parseRow(row: any) {
  return {
    id: row.id,
    platform: row.platform,
    username: row.username,
    favorite: Boolean(row.favorite),
    notes: row.notes ?? null,
    tags: JSON.parse(String(row.tags || '[]')),
    createdAt: row.createdAt,
  };
}

// POST /analyze — run a scout (costs 3 credits)
router.post('/analyze', creditGuard('profile_scout'), async (req: AuthRequest, res) => {
  try {
    const { username, platform } = req.body;
    if (!username || !platform) return ResponseUtil.error(res, 400, 'username and platform required');
    if (!['youtube', 'tiktok'].includes(platform)) return ResponseUtil.error(res, 400, 'platform must be youtube or tiktok');

    const report = platform === 'youtube' ? await scoutYouTube(username) : await scoutTikTok(username);

    const id = generateUUID();
    await Database.execute(
      'INSERT INTO ProfileScoutReports (id, userId, platform, username, report) VALUES (?, ?, ?, ?, ?)',
      [id, req.user!.id, platform, username, JSON.stringify(report)]
    );
    await (req as any).consumeCredits(`${platform}:${username}`);

    return ResponseUtil.success(res, 200, { id, ...report, favorite: false, notes: null, tags: [] }, 'Profile scouted');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// GET /history — list past analyses
router.get('/history', async (req: AuthRequest, res) => {
  try {
    const { platform, favorite, tag } = req.query;
    const filters = ['userId = ?'];
    const params: any[] = [req.user!.id];

    if (platform) { filters.push('platform = ?'); params.push(platform); }
    if (favorite === 'true') { filters.push('favorite = 1'); }

    const result = await Database.execute(
      `SELECT id, platform, username, favorite, notes, tags, createdAt
       FROM ProfileScoutReports WHERE ${filters.join(' AND ')} ORDER BY createdAt DESC LIMIT 50`,
      params
    );

    let rows = result.rows.map(parseRow);
    if (tag) rows = rows.filter(r => r.tags.includes(tag));

    return ResponseUtil.success(res, 200, rows, 'History retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// GET /history/:id — full report
router.get('/history/:id', async (req: AuthRequest, res) => {
  try {
    const result = await Database.execute(
      'SELECT * FROM ProfileScoutReports WHERE id = ? AND userId = ?',
      [req.params.id, req.user!.id]
    );
    if (!result.rows.length) return ResponseUtil.error(res, 404, 'Report not found');
    const row = result.rows[0];
    return ResponseUtil.success(res, 200, {
      ...parseRow(row),
      ...JSON.parse(String(row.report)),
    }, 'Report retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// DELETE /history/:id
router.delete('/history/:id', async (req: AuthRequest, res) => {
  try {
    await Database.execute(
      'DELETE FROM ProfileScoutReports WHERE id = ? AND userId = ?',
      [req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, null, 'Report deleted');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// PUT /history/:id/favorite — toggle
router.put('/history/:id/favorite', async (req: AuthRequest, res) => {
  try {
    const current = await Database.execute(
      'SELECT favorite FROM ProfileScoutReports WHERE id = ? AND userId = ?',
      [req.params.id, req.user!.id]
    );
    if (!current.rows.length) return ResponseUtil.error(res, 404, 'Report not found');
    const newVal = current.rows[0].favorite ? 0 : 1;
    await Database.execute(
      'UPDATE ProfileScoutReports SET favorite = ? WHERE id = ? AND userId = ?',
      [newVal, req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, { favorite: Boolean(newVal) }, 'Favorite toggled');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// PUT /history/:id/notes
router.put('/history/:id/notes', async (req: AuthRequest, res) => {
  try {
    const { notes } = req.body;
    await Database.execute(
      'UPDATE ProfileScoutReports SET notes = ? WHERE id = ? AND userId = ?',
      [notes ?? null, req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, null, 'Notes updated');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// POST /history/:id/tags — add tags
router.post('/history/:id/tags', async (req: AuthRequest, res) => {
  try {
    const { tags } = req.body; // string[]
    if (!Array.isArray(tags)) return ResponseUtil.error(res, 400, 'tags must be an array');
    const current = await Database.execute(
      'SELECT tags FROM ProfileScoutReports WHERE id = ? AND userId = ?',
      [req.params.id, req.user!.id]
    );
    if (!current.rows.length) return ResponseUtil.error(res, 404, 'Report not found');
    const existing: string[] = JSON.parse(String(current.rows[0].tags || '[]'));
    const merged = [...new Set([...existing, ...tags])];
    await Database.execute(
      'UPDATE ProfileScoutReports SET tags = ? WHERE id = ? AND userId = ?',
      [JSON.stringify(merged), req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, { tags: merged }, 'Tags added');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// DELETE /history/:id/tags — remove tags
router.delete('/history/:id/tags', async (req: AuthRequest, res) => {
  try {
    const { tags } = req.body; // string[]
    if (!Array.isArray(tags)) return ResponseUtil.error(res, 400, 'tags must be an array');
    const current = await Database.execute(
      'SELECT tags FROM ProfileScoutReports WHERE id = ? AND userId = ?',
      [req.params.id, req.user!.id]
    );
    if (!current.rows.length) return ResponseUtil.error(res, 404, 'Report not found');
    const existing: string[] = JSON.parse(String(current.rows[0].tags || '[]'));
    const updated = existing.filter(t => !tags.includes(t));
    await Database.execute(
      'UPDATE ProfileScoutReports SET tags = ? WHERE id = ? AND userId = ?',
      [JSON.stringify(updated), req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, { tags: updated }, 'Tags removed');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// GET /stats — dashboard metrics
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const total = await Database.execute(
      'SELECT COUNT(*) as count FROM ProfileScoutReports WHERE userId = ?', [req.user!.id]
    );
    const favorites = await Database.execute(
      'SELECT COUNT(*) as count FROM ProfileScoutReports WHERE userId = ? AND favorite = 1', [req.user!.id]
    );
    const byPlatform = await Database.execute(
      'SELECT platform, COUNT(*) as count FROM ProfileScoutReports WHERE userId = ? GROUP BY platform', [req.user!.id]
    );
    const recent = await Database.execute(
      'SELECT id, platform, username, createdAt FROM ProfileScoutReports WHERE userId = ? ORDER BY createdAt DESC LIMIT 5',
      [req.user!.id]
    );
    return ResponseUtil.success(res, 200, {
      total: Number(total.rows[0]?.count ?? 0),
      favorites: Number(favorites.rows[0]?.count ?? 0),
      byPlatform: byPlatform.rows,
      recentAnalyses: recent.rows,
    }, 'Stats retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// GET /outliers — fetch viral outlier & rising trend videos from YouTube Shorts + TikTok
router.get('/outliers', async (req: AuthRequest, res) => {
  try {
    const { platform = 'both', niche = '' } = req.query as { platform?: string; niche?: string };
    const results: any[] = [];

    // YouTube Shorts outliers
    if (platform === 'youtube' || platform === 'both') {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (apiKey) {
        const q = niche ? `${niche} shorts` : '#shorts';
        const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: { part: 'id', q, type: 'video', videoDuration: 'short', order: 'viewCount', maxResults: 20, publishedAfter: new Date(Date.now() - 14 * 86400000).toISOString(), key: apiKey }
        });
        const ids = searchRes.data.items?.map((i: any) => i.id.videoId).join(',');
        if (ids) {
          const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'snippet,statistics,contentDetails', id: ids, key: apiKey }
          });
          for (const v of statsRes.data.items || []) {
            const views = parseInt(v.statistics.viewCount || '0');
            const likes = parseInt(v.statistics.likeCount || '0');
            const subs = parseInt(v.statistics.commentCount || '0');
            const daysOld = (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 86400000;
            const velocityScore = Math.round(views / Math.max(daysOld, 1) / 1000); // K views/day
            results.push({
              id: v.id, platform: 'youtube',
              title: v.snippet.title,
              channelName: v.snippet.channelTitle,
              thumbnailUrl: v.snippet.thumbnails?.medium?.url || '',
              url: `https://www.youtube.com/shorts/${v.id}`,
              viewCount: views, likeCount: likes,
              publishedAt: v.snippet.publishedAt,
              daysOld: Math.round(daysOld),
              velocityScore,
              type: daysOld <= 3 && velocityScore > 500 ? 'rising_star' : 'outlier',
            });
          }
        }
      }
    }

    // TikTok outliers via RapidAPI
    if (platform === 'tiktok' || platform === 'both') {
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (rapidApiKey) {
        const keyword = niche || 'viral';
        const tiktokRes = await axios.get('https://tiktok-scraper7.p.rapidapi.com/feed/search', {
          params: { keywords: keyword, count: 20, sort_type: '1', publish_time: '1' }, // sort by likes, last week
          headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com' }
        });
        for (const v of tiktokRes.data.data?.videos || []) {
          const views = v.play_count || 0;
          const daysOld = (Date.now() - (v.create_time || 0) * 1000) / 86400000;
          const velocityScore = Math.round(views / Math.max(daysOld, 1) / 1000);
          results.push({
            id: v.video_id, platform: 'tiktok',
            title: v.title || v.desc || '',
            channelName: v.author?.nickname || v.author?.unique_id || '',
            thumbnailUrl: v.cover || '',
            url: `https://www.tiktok.com/@${v.author?.unique_id}/video/${v.video_id}`,
            viewCount: views, likeCount: v.digg_count || 0,
            publishedAt: new Date((v.create_time || 0) * 1000).toISOString(),
            daysOld: Math.round(daysOld),
            velocityScore,
            type: daysOld <= 3 && velocityScore > 200 ? 'rising_star' : 'outlier',
          });
        }
      }
    }

    results.sort((a, b) => b.velocityScore - a.velocityScore);
    return ResponseUtil.success(res, 200, results, 'Outliers retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

export default router;
