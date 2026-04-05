import express from 'express';
import { authenticateUser } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { UserCreditsModel, PLANS } from '../schemas';
import { ensureCredits } from '../services/creditsService';

const router = express.Router();

// GET /api/v2/credits/status
router.get('/status', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const credits = await ensureCredits(req.user!.id);
    const plan = credits.plan as keyof typeof PLANS;
    res.json({
      credits,
      plan: PLANS[plan],
      isUnlimited: PLANS[plan].monthlyCredits === 999999
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/v2/credits/transactions
router.get('/transactions', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const transactions = await UserCreditsModel.getTransactions(req.user!.id);
    res.json({ transactions });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/v2/credits/plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([id, p]) => ({
    id, ...p,
    monthlyCredits: p.monthlyCredits === 999999 ? 'Unlimited' : p.monthlyCredits
  }));
  res.json({ plans });
});

export default router;
