import { UserCreditsModel, PLANS, type PlanId } from '../schemas';
import { Database } from '../../models';

export const CREDIT_COSTS = {
  publish_post: 1,
  schedule_post: 1,
  connect_account: 1,
  generate_hooks: 1,
  generate_caption: 1,
  generate_slideshow: 2,
  profile_scout: 3,
  generate_carousel: 2,
} as const;

export async function ensureCredits(userId: string) {
  let credits = await UserCreditsModel.findByUser(userId);
  if (!credits) credits = await UserCreditsModel.initForUser(userId, 'free');

  // Self-heal: if creditsRemaining is absurdly high (e.g. accidentally set to 999999),
  // cap it to the plan's actual monthly credits
  const plan = (credits.plan as PlanId) || 'free';
  const planMax = PLANS[plan].monthlyCredits as number;
  if (Number(credits.creditsRemaining) > planMax * 10) {
    await Database.execute(
      'UPDATE UserCredits SET creditsRemaining = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?',
      [planMax, userId]
    );
    credits = await UserCreditsModel.findByUser(userId);
  }

  return credits;
}

export async function checkCredits(userId: string, cost: number): Promise<{ allowed: boolean; remaining: number; reason?: string }> {
  const credits = await ensureCredits(userId);
  const remaining = Number(credits.creditsRemaining);

  if (remaining < cost) {
    return {
      allowed: false,
      remaining,
      reason: `Insufficient credits. You have ${remaining} credit${remaining === 1 ? '' : 's'} remaining. Upgrade your plan or wait for your next billing cycle.`
    };
  }
  return { allowed: true, remaining };
}

export async function consumeCredits(userId: string, cost: number, description: string, postId?: string, apiEndpoint?: string) {
  await UserCreditsModel.consume(userId, cost, description, postId, apiEndpoint);
}
