import { UserCreditsModel, PLANS, type PlanId } from '../schemas';

export const CREDIT_COSTS = {
  publish_post: 1,
  schedule_post: 1,
  connect_account: 1,
} as const;

export async function ensureCredits(userId: string) {
  let credits = await UserCreditsModel.findByUser(userId);
  if (!credits) credits = await UserCreditsModel.initForUser(userId, 'free');
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
