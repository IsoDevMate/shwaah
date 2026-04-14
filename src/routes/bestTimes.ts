import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { Database } from '../models';

const router = Router();
router.use(authenticateUser);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * GET /api/best-times?platform=tiktok&timezone=Africa/Nairobi
 *
 * Returns top 5 day+hour slots ranked by avg engagement rate
 * based on the user's own published posts.
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { platform, timezone = 'UTC' } = req.query as { platform?: string; timezone?: string };

    const platformFilter = platform ? 'AND a.platform = ?' : '';
    const params: any[] = [req.user!.id];
    if (platform) params.push(platform);

    // Group posts by day-of-week + hour (SQLite strftime uses UTC)
    // We'll shift to user timezone in JS after fetching
    const rows = await Database.execute(
      `SELECT
         a.platform,
         CAST(strftime('%w', p.createdAt) AS INTEGER) as dow,
         CAST(strftime('%H', p.createdAt) AS INTEGER) as hour,
         AVG(a.engagementRate) as avgEngagement,
         COUNT(*) as postCount
       FROM Analytics a
       JOIN Posts p ON a.postId = p.id
       WHERE p.userId = ? ${platformFilter}
         AND a.engagementRate > 0
       GROUP BY a.platform, dow, hour
       HAVING postCount >= 1
       ORDER BY a.platform, avgEngagement DESC`,
      params
    );

    if (!rows.rows.length) {
      return ResponseUtil.success(res, 200, [], 'Not enough data yet — publish more posts to get personalized recommendations');
    }

    // Apply timezone offset
    const offsetHours = getTimezoneOffsetHours(timezone);

    // Group by platform, take top 5 slots each
    const byPlatform: Record<string, any[]> = {};
    for (const row of rows.rows) {
      const plt = String(row.platform);
      if (!byPlatform[plt]) byPlatform[plt] = [];
      if (byPlatform[plt].length >= 5) continue;

      // Shift UTC hour to local
      let localHour = (Number(row.hour) + offsetHours) % 24;
      if (localHour < 0) localHour += 24;
      // Shift day if hour wrapped
      let localDow = Number(row.dow);
      const rawShifted = Number(row.hour) + offsetHours;
      if (rawShifted >= 24) localDow = (localDow + 1) % 7;
      if (rawShifted < 0) localDow = (localDow + 6) % 7;

      byPlatform[plt].push({
        platform: plt,
        day: DAYS[localDow],
        hour: localHour,
        timeLabel: formatHour(localHour),
        avgEngagementRate: parseFloat(Number(row.avgEngagement).toFixed(4)),
        basedOnPosts: Number(row.postCount),
      });
    }

    return ResponseUtil.success(res, 200, byPlatform, 'Best times retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}

// Rough offset lookup — covers common creator timezones
// For production, use a proper tz library (luxon/date-fns-tz)
function getTimezoneOffsetHours(tz: string): number {
  const offsets: Record<string, number> = {
    'UTC': 0,
    'Africa/Nairobi': 3, 'Africa/Lagos': 1, 'Africa/Cairo': 2, 'Africa/Johannesburg': 2,
    'America/New_York': -5, 'America/Chicago': -6, 'America/Denver': -7, 'America/Los_Angeles': -8,
    'America/Sao_Paulo': -3, 'America/Mexico_City': -6,
    'Europe/London': 0, 'Europe/Paris': 1, 'Europe/Berlin': 1, 'Europe/Moscow': 3,
    'Asia/Dubai': 4, 'Asia/Karachi': 5, 'Asia/Kolkata': 5, 'Asia/Dhaka': 6,
    'Asia/Bangkok': 7, 'Asia/Singapore': 8, 'Asia/Tokyo': 9, 'Asia/Seoul': 9,
    'Australia/Sydney': 10, 'Pacific/Auckland': 12,
  };
  return offsets[tz] ?? 0;
}

export default router;
