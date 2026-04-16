import { Router } from 'express';
import { authenticateUser as authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { ContentGoal } from '../models/tursoModels';
import { getStreakData } from '../services/goalsService';
import { Database } from '../models';

const router = Router();
router.use(authMiddleware);

// Create or update a goal
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { platform, targetPerWeek, name, targetFollowers, deadline } = req.body;
    if (!platform || !targetPerWeek) return ResponseUtil.error(res, 400, 'platform and targetPerWeek required');
    const goal = await ContentGoal.upsert({ userId: req.user!.id, platform, targetPerWeek, name, targetFollowers, deadline });
    return ResponseUtil.success(res, 200, goal, 'Goal saved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Get all goals with streak data
router.get('/', async (req: AuthRequest, res) => {
  try {
    const goals = await ContentGoal.findByUser(req.user!.id);
    const data = await Promise.all(goals.map(async g => {
      const streak = await getStreakData(req.user!.id, String(g.platform), Number(g.targetPerWeek));
      return {
        ...streak,
        id: g.id,
        name: g.name ?? null,
        targetFollowers: g.targetFollowers ? Number(g.targetFollowers) : null,
        deadline: g.deadline ?? null,
        createdAt: g.createdAt,
      };
    }));
    return ResponseUtil.success(res, 200, data, 'Goals retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// GET /:platform/progress — weekly post counts + follower snapshots for graph
router.get('/:platform/progress', async (req: AuthRequest, res) => {
  try {
    const { platform } = req.params;

    // Weekly post counts (last 12 weeks)
    const postRows = await Database.execute(
      `SELECT strftime('%Y-%W', createdAt) as week, COUNT(*) as count
       FROM Posts
       JOIN json_each(platforms)
       WHERE userId = ?
         AND status IN ('published','posted')
         AND json_each.value = ?
         AND createdAt >= datetime('now', '-12 weeks')
       GROUP BY week
       ORDER BY week ASC`,
      [req.user!.id, platform]
    );

    // Follower snapshots (last 90 days)
    const followerRows = await Database.execute(
      `SELECT count, recordedAt FROM FollowerSnapshots
       WHERE userId = ? AND platform = ?
         AND recordedAt >= datetime('now', '-90 days')
       ORDER BY recordedAt ASC`,
      [req.user!.id, platform]
    );

    return ResponseUtil.success(res, 200, {
      weeklyPosts: postRows.rows.map(r => ({ week: r.week, count: Number(r.count) })),
      followerHistory: followerRows.rows.map(r => ({ date: r.recordedAt, count: Number(r.count) })),
    }, 'Progress retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Delete a goal
router.delete('/:platform', async (req: AuthRequest, res) => {
  try {
    await ContentGoal.delete(req.user!.id, req.params.platform);
    return ResponseUtil.success(res, 200, null, 'Goal deleted');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

export default router;
