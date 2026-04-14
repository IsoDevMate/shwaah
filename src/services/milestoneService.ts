import { Database, generateUUID } from '../models';
import { Notification } from '../models/tursoModels';

const MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];

export async function recordFollowerSnapshot(userId: string, platform: string, count: number) {
  // Get previous snapshot
  const prev = await Database.execute(
    'SELECT count FROM FollowerSnapshots WHERE userId = ? AND platform = ? ORDER BY recordedAt DESC LIMIT 1',
    [userId, platform]
  );

  const prevCount = prev.rows.length ? Number(prev.rows[0].count) : 0;

  // Save new snapshot
  await Database.execute(
    'INSERT INTO FollowerSnapshots (id, userId, platform, count) VALUES (?, ?, ?, ?)',
    [generateUUID(), userId, platform, count]
  );

  // Check if any milestone was crossed
  for (const milestone of MILESTONES) {
    if (prevCount < milestone && count >= milestone) {
      await Notification.create({
        userId,
        type: 'milestone',
        title: `🎉 ${formatCount(milestone)} followers on ${platform}!`,
        message: `You just hit ${formatCount(milestone)} followers on ${platform}. Huge milestone — keep going!`,
      });
    }
  }
}

export async function getFollowerHistory(userId: string, platform?: string) {
  const filter = platform ? 'AND platform = ?' : '';
  const params: any[] = [userId];
  if (platform) params.push(platform);

  const result = await Database.execute(
    `SELECT platform, count, recordedAt FROM FollowerSnapshots
     WHERE userId = ? ${filter}
     ORDER BY recordedAt ASC`,
    params
  );
  return result.rows;
}

export async function getLatestCounts(userId: string) {
  const result = await Database.execute(
    `SELECT platform, count, recordedAt FROM FollowerSnapshots
     WHERE userId = ? AND recordedAt = (
       SELECT MAX(s2.recordedAt) FROM FollowerSnapshots s2
       WHERE s2.userId = FollowerSnapshots.userId AND s2.platform = FollowerSnapshots.platform
     )`,
    [userId]
  );
  return result.rows;
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${n / 1000000}M`;
  if (n >= 1000) return `${n / 1000}K`;
  return String(n);
}
