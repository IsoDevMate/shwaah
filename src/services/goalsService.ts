import { Database, generateUUID } from '../models';

/**
 * Computes streak + weekly progress for a user's goal on a platform.
 * A "week" is Mon–Sun. A streak increments when the user met their target
 * every week going back consecutively from the current week.
 */
export async function getStreakData(userId: string, platform: string, targetPerWeek: number) {
  // Get posts per calendar week for this platform (last 52 weeks)
  const rows = await Database.execute(
    `SELECT strftime('%Y-%W', createdAt) as week, COUNT(*) as count
     FROM Posts
     JOIN json_each(platforms)
     WHERE userId = ?
       AND status IN ('published','posted')
       AND json_each.value = ?
       AND createdAt >= datetime('now', '-52 weeks')
     GROUP BY week
     ORDER BY week DESC`,
    [userId, platform]
  );

  const weekMap: Record<string, number> = {};
  for (const row of rows.rows) {
    weekMap[String(row.week)] = Number(row.count);
  }

  // Current week
  const now = new Date();
  const currentWeek = getISOWeekKey(now);

  // Count current week posts
  const thisWeekCount = weekMap[currentWeek] ?? 0;

  // Calculate streak (consecutive past weeks where target was met, not counting current)
  let streak = 0;
  const check = new Date(now);
  check.setDate(check.getDate() - 7); // start from last week
  for (let i = 0; i < 52; i++) {
    const key = getISOWeekKey(check);
    if ((weekMap[key] ?? 0) >= targetPerWeek) {
      streak++;
      check.setDate(check.getDate() - 7);
    } else {
      break;
    }
  }

  // If current week already meets target, include it in streak
  if (thisWeekCount >= targetPerWeek) streak++;

  return {
    platform,
    targetPerWeek,
    thisWeekCount,
    streak,
    metThisWeek: thisWeekCount >= targetPerWeek,
    remaining: Math.max(0, targetPerWeek - thisWeekCount),
  };
}

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-${String(weekNum).padStart(2, '0')}`;
}
