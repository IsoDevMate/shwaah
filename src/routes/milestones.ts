import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { getFollowerHistory, getLatestCounts } from '../services/milestoneService';

const router = Router();
router.use(authenticateUser);

// GET /api/milestones/history?platform=tiktok
router.get('/history', async (req: AuthRequest, res) => {
  try {
    const { platform } = req.query as { platform?: string };
    const history = await getFollowerHistory(req.user!.id, platform);
    return ResponseUtil.success(res, 200, history, 'Follower history retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// GET /api/milestones/latest — latest follower count per platform
router.get('/latest', async (req: AuthRequest, res) => {
  try {
    const counts = await getLatestCounts(req.user!.id);
    return ResponseUtil.success(res, 200, counts, 'Latest counts retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

export default router;
