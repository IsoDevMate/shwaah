import { Request, Response, NextFunction } from 'express';
import { checkCredits, consumeCredits, CREDIT_COSTS, ensureCredits } from '../services/creditsService';
import { PLANS, type PlanId } from '../schemas';
import { SocialAccount } from '../../models/tursoModels';
import { AuthRequest } from '../../types';

const ACTION_LABELS: Record<string, string> = {
  publish_post: 'Published post',
  schedule_post: 'Scheduled post',
  connect_account: 'Connected account',
  generate_hooks: 'Generated hooks',
  generate_caption: 'Generated captions & hashtags',
  generate_slideshow: 'Generated slideshow',
};

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
      (req as any).consumeCredits = (extra?: string) => {
        const desc = extra ? `${ACTION_LABELS[action] || action}: ${extra}` : (ACTION_LABELS[action] || action);
        return consumeCredits(userId, cost, desc);
      };
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
