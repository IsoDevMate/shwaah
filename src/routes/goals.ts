import { Router } from 'express';
import { authenticateUser as authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { ContentGoal } from '../models/tursoModels';
import { getStreakData } from '../services/goalsService';

const router = Router();
router.use(authMiddleware);

// Create or update a goal
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { platform, targetPerWeek } = req.body;
    if (!platform || !targetPerWeek) return ResponseUtil.error(res, 400, 'platform and targetPerWeek required');
    const goal = await ContentGoal.upsert({ userId: req.user!.id, platform, targetPerWeek });
    return ResponseUtil.success(res, 200, goal, 'Goal saved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Get all goals with streak data
router.get('/', async (req: AuthRequest, res) => {
  try {
    const goals = await ContentGoal.findByUser(req.user!.id);
    const data = await Promise.all(goals.map(g => getStreakData(req.user!.id, String(g.platform), Number(g.targetPerWeek))));
    return ResponseUtil.success(res, 200, data, 'Goals retrieved');
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
