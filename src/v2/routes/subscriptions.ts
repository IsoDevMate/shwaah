import express from 'express';
import { authenticateUser } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { paymentProvider } from '../services/paystackService';
import { UserCreditsModel, SubscriptionModel, AffiliateModel, PLANS, type PlanId } from '../schemas';
import { ensureCredits } from '../services/creditsService';

const router = express.Router();

// GET /api/v2/subscriptions/plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([id, p]) => ({
    id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly,
    monthlyCredits: p.monthlyCredits === 999999 ? 'Unlimited' : p.monthlyCredits,
    platformLimits: p.platformLimits,
    features: p.features
  }));
  res.json({ plans });
});

// POST /api/v2/subscriptions/checkout
router.post('/checkout', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { plan, billingCycle = 'monthly' } = req.body;
    if (!plan || !PLANS[plan as PlanId]) return res.status(400).json({ message: 'Invalid plan' });
    if (plan === 'free') return res.status(400).json({ message: 'Free plan requires no payment' });

    const callbackUrl = `${process.env.FRONTEND_URL || 'https://shwaah-frontend-31fs.vercel.app'}/billing/callback`;
    const { checkoutUrl, reference } = await paymentProvider.initializePayment({
      email: req.user!.email,
      plan,
      billingCycle,
      userId: req.user!.id,
      callbackUrl
    });

    res.json({ checkoutUrl, reference });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/v2/subscriptions/verify?reference=xxx
router.get('/verify', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { reference } = req.query;
    if (!reference) return res.status(400).json({ message: 'Reference required' });

    const result = await paymentProvider.verifyPayment(reference as string);
    if (!result.success) return res.status(400).json({ message: 'Payment not successful' });

    const plan = result.plan as PlanId;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + (result.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000);

    await SubscriptionModel.upsert(req.user!.id, {
      plan,
      status: 'active',
      billingCycle: result.billingCycle,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      paystackCustomerId: result.customerId || null,
      paystackSubscriptionCode: result.subscriptionCode || null
    });

    await UserCreditsModel.upgradePlan(req.user!.id, plan);

    // Affiliate commission — check if this user was referred
    const referral = await checkReferralForUser(req.user!.id);
    if (referral) {
      const commissionCredits = Math.floor(result.amount * 0.10 / 100); // 10% of payment in credits
      await UserCreditsModel.add(String(referral.affiliateUserId), commissionCredits, `Referral commission from ${req.user!.email}`);
      await AffiliateModel.addEarnings(String(referral.affiliateId), commissionCredits);
    }

    res.json({ success: true, plan, message: `Upgraded to ${plan} plan` });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/v2/subscriptions/webhook (Paystack webhook)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    // Body may already be parsed by express.json() or arrive as raw buffer
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { event, data } = await paymentProvider.handleWebhook(payload, signature);

    if (event === 'charge.success') {
      const { userId, plan, billingCycle } = data.metadata || {};
      if (userId && plan) {
        await UserCreditsModel.upgradePlan(userId, plan as PlanId);
        await SubscriptionModel.upsert(userId, {
          plan,
          status: 'active',
          billingCycle: billingCycle || 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          paystackCustomerId: data.customer?.customer_code || null,
          paystackSubscriptionCode: null
        });
      }
    }

    if (event === 'subscription.disable') {
      const userId = data.metadata?.userId;
      if (userId) {
        await SubscriptionModel.upsert(userId, { plan: 'free', status: 'cancelled', billingCycle: 'monthly', currentPeriodStart: null, currentPeriodEnd: null, paystackCustomerId: null, paystackSubscriptionCode: null });
        await UserCreditsModel.upgradePlan(userId, 'free');
      }
    }

    res.sendStatus(200);
  } catch (err: any) {
    console.error('[Webhook]', err.message);
    res.sendStatus(400);
  }
});

// GET /api/v2/subscriptions/status
router.get('/status', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const [sub, credits] = await Promise.all([
      SubscriptionModel.findByUser(req.user!.id),
      ensureCredits(req.user!.id)
    ]);
    res.json({ subscription: sub, credits });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

async function checkReferralForUser(userId: string) {
  const { Database } = await import('../../models');
  const r = await Database.execute(
    'SELECT r.*, a.userId as affiliateUserId FROM Referrals r JOIN Affiliates a ON r.affiliateId = a.id WHERE r.referredUserId = ? AND r.status = ?',
    [userId, 'signed_up']
  );
  return r.rows[0] || null;
}

export default router;
