import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { DirectionSession } from '../models/directionSession';
import { generateWeeklyDirection } from '../services/directionEngineService';

const router = Router();
router.use(authenticateUser);

const weeklySchema = z.object({
  happenedThisWeek: z.string().min(8).max(2000),
  belief: z.string().min(4).max(1000),
  audience: z.string().min(3).max(500),
  mode: z.enum(['teach', 'show', 'opinion']),
});

router.post('/weekly', async (req: AuthRequest, res: Response) => {
  const parsed = weeklySchema.safeParse(req.body);
  if (!parsed.success) {
    return ResponseUtil.error(res, 400, 'Weekly direction answers are incomplete', parsed.error);
  }

  try {
    const ideas = await generateWeeklyDirection(parsed.data);
    const session = await DirectionSession.create({
      userId: req.user!.id,
      answers: parsed.data,
      ideas,
    });
    return ResponseUtil.success(res, 201, session, 'Weekly direction generated');
  } catch (error) {
    return ResponseUtil.error(res, 502, 'Could not generate weekly direction.', error);
  }
});

router.get('/weekly', async (req: AuthRequest, res: Response) => {
  const sessions = await DirectionSession.findByUser(req.user!.id);
  return ResponseUtil.success(res, 200, sessions, 'Direction history retrieved');
});

export default router;
