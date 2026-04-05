import { Request, Response, NextFunction } from 'express';
import { checkCredits, consumeCredits, CREDIT_COSTS, ensureCredits } from '../services/creditsService';
import { PLANS, type PlanId } from '../schemas';
import { SocialAccount } from '../../models/tursoModels';
import { AuthRequest } from '../../types';

// Deducts credits for post creation/publishing
export function creditGuard(action: keyof typeof CREDIT_COSTS) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const cost = CREDIT_COSTS[action];
      const { allowed, remaining, reason } = await checkCredits(userId, cost);
      if (!allowed) {
        return res.status(402).json({ success: false, message: reason, creditsRemaining: remaining, upgradeRequired: true });
      }
      // Attach consume function to req so route can call it after success
      (req as any).consumeCredits = () => consumeCredits(userId, cost, action);
      next();
    } catch (err: any) {
      next(err);
    }
  };
}

// Checks platform connection limit before connecting a new account
export function platformLimitGuard(req: AuthRequest, res: Response, next: NextFunction) {
  return async () => {
    try {
      const userId = req.user!.id;
      const platform = req.params.platform as string;
      const credits = await ensureCredits(userId);
      const plan = credits.plan as PlanId;
      const limit = PLANS[plan].platformLimits[platform as keyof typeof PLANS.free.platformLimits] ?? 0;

      if (limit === 0) {
        return res.status(403).json({
          success: false,
          message: `Your ${plan} plan does not include ${platform} connections. Upgrade to connect ${platform}.`,
          upgradeRequired: true
        });
      }

      const existing = await SocialAccount.findByUserAndPlatforms(userId, [platform]);
      if (existing.length >= limit) {
        return res.status(403).json({
          success: false,
          message: `You've reached the ${platform} account limit (${limit}) for your ${plan} plan.`,
          upgradeRequired: true
        });
      }
      next();
    } catch (err: any) {
      next(err);
    }
  };
}

// Wraps platformLimitGuard as proper middleware
export async function platformLimitMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform as string;
    const credits = await ensureCredits(userId);
    const plan = credits.plan as PlanId;
    const limit = PLANS[plan].platformLimits[platform as keyof typeof PLANS.free.platformLimits] ?? 0;

    if (limit === 0) {
      return res.status(403).json({
        success: false,
        message: `Your ${plan} plan does not include ${platform} connections. Upgrade to connect ${platform}.`,
        upgradeRequired: true
      });
    }

    const existing = await SocialAccount.findByUserAndPlatforms(userId, [platform]);
    if (existing.length >= limit) {
      return res.status(403).json({
        success: false,
        message: `You've reached the ${platform} account limit (${limit}) for your ${plan} plan.`,
        upgradeRequired: true
      });
    }
    next();
  } catch (err: any) {
    next(err);
  }
}
