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
    const planConfig = PLANS[plan];

    res.json({
      success: true,
      data: {
        userId: req.user!.id,
        currentPlan: plan,
        credits: {
          remaining: Number(credits.creditsRemaining),
          used: Number(credits.creditsUsedThisCycle),
          rollover: Number(credits.rolloverCredits),
          total: planConfig.monthlyCredits,
        },
        platformLimits: planConfig.platformLimits,
        features: planConfig.features,
        nextResetDate: credits.cycleEnd,
        // Legacy fields
        creditsRemaining: Number(credits.creditsRemaining),
        plan: planConfig,
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/v2/credits/platform-limits
router.get('/platform-limits', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const credits = await ensureCredits(req.user!.id);
    const plan = credits.plan as keyof typeof PLANS;
    res.json({
      success: true,
      data: {
        currentPlan: plan,
        platformLimits: PLANS[plan].platformLimits,
        nextResetDate: credits.cycleEnd,
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/v2/credits/transactions
router.get('/transactions', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const transactions = await UserCreditsModel.getTransactions(req.user!.id, limit);
    res.json({
      success: true,
      data: {
        transactions: transactions.map((t: any) => ({
          id: String(t.id),
          type: String(t.type),
          amount: Number(t.amount),
          description: String(t.description || ''),
          balanceAfter: t.balanceAfter !== null ? Number(t.balanceAfter) : null,
          apiEndpoint: t.apiEndpoint ? String(t.apiEndpoint) : null,
          postId: t.postId ? String(t.postId) : null,
          createdAt: String(t.createdAt),
        })),
        total: transactions.length,
      }
    });
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
  res.json({ success: true, data: { plans } });
});

export default router;
