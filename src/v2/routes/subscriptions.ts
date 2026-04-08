import express from 'express';
import { authenticateUser } from '../../middleware/auth';
import { AuthRequest } from '../../types';
import { paymentProvider } from '../services/paystackService';
import { UserCreditsModel, SubscriptionModel, AffiliateModel, PLANS, PaymentHistoryModel, type PlanId } from '../schemas';
import { ensureCredits } from '../services/creditsService';
import { sendReceiptEmail } from '../services/emailService';
import { Notification } from '../../models/tursoModels';
import { User } from '../../models/tursoModels';

const router = express.Router();

// GET /api/v2/subscriptions/plans
router.get('/plans', (req, res) => {
  const plans = Object.entries(PLANS).map(([id, p]) => ({
    id,
    name: p.name,
    priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly,
    monthlyCredits: (p.monthlyCredits as number) === 999999 ? 'Unlimited' : p.monthlyCredits,
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

    // Idempotency: if we already recorded this payment successfully, don't re-process
    const { Database } = await import('../../models');
    const existing = await Database.execute(
      'SELECT * FROM PaymentHistory WHERE reference = ? AND status = ?',
      [reference as string, 'success']
    );
    if (existing.rows.length > 0) {
      const updatedCredits = await ensureCredits(req.user!.id);
      return res.json({
        success: true,
        plan: updatedCredits.plan,
        message: 'Payment already processed',
        credits: { remaining: Number(updatedCredits.creditsRemaining), plan: updatedCredits.plan }
      });
    }

    const result = await paymentProvider.verifyPayment(reference as string);
    if (!result.success) {
      // Record failed attempt so we can audit it
      await PaymentHistoryModel.record({
        userId: req.user!.id,
        reference: result.reference,
        plan: result.plan || 'unknown',
        billingCycle: result.billingCycle || 'monthly',
        amount: result.amount || 0,
        currency: 'KES',
        status: 'failed',
        paystackCustomerId: result.customerId || undefined,
      }).catch(() => {});
      return res.status(400).json({ message: 'Payment not successful' });
    }

    const plan = result.plan as PlanId;

    // Guard: don't downgrade — only allow upgrade or same plan renewal
    const currentCredits = await ensureCredits(req.user!.id);
    const planOrder = ['free', 'creator', 'pro'];
    const currentIdx = planOrder.indexOf(currentCredits.plan as string);
    const newIdx = planOrder.indexOf(plan);
    if (newIdx < currentIdx) {
      return res.status(400).json({ message: `You are already on a higher plan (${currentCredits.plan}). Cannot downgrade via payment.` });
    }

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

    // Record payment history
    await PaymentHistoryModel.record({
      userId: req.user!.id,
      reference: result.reference,
      plan,
      billingCycle: result.billingCycle,
      amount: result.amount,
      currency: 'KES',
      status: 'success',
      paystackCustomerId: result.customerId || undefined,
    });

    // Log the credit allocation as a transaction
    await UserCreditsModel.add(req.user!.id, 0, `Plan upgraded to ${plan} — credits reset to ${(PLANS[plan].monthlyCredits as number) === 999999 ? 'Unlimited' : PLANS[plan].monthlyCredits}`);

    // In-app notification
    await Notification.create({
      userId: req.user!.id,
      type: 'success',
      title: `Upgraded to ${PLANS[plan].name} plan`,
      message: `Your payment was successful. You now have ${(PLANS[plan].monthlyCredits as number) === 999999 ? 'unlimited' : PLANS[plan].monthlyCredits} credits.`,
    });

    // Affiliate commission
    const referral = await checkReferralForUser(req.user!.id);
    if (referral) {
      const commissionCredits = Math.max(1, Math.floor(result.amount * 0.10 / 100));
      await UserCreditsModel.add(String(referral.affiliateUserId), commissionCredits, `Referral commission from ${req.user!.email}`);
      await AffiliateModel.addEarnings(String(referral.affiliateId), commissionCredits);
    }

    // Send receipt email (non-blocking)
    const user = await User.findById(req.user!.id);
    sendReceiptEmail(req.user!.email, {
      name: user?.name || req.user!.email,
      plan,
      amount: result.amount,
      currency: 'KES',
      reference: result.reference,
      creditsAllocated: PLANS[plan].monthlyCredits,
      billingCycle: result.billingCycle,
      nextBillingDate: periodEnd.toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' }),
    }).catch(e => console.warn('[Email] Receipt failed:', e.message));

    const updatedCredits = await ensureCredits(req.user!.id);
    res.json({
      success: true,
      plan,
      message: `Upgraded to ${PLANS[plan].name} plan`,
      credits: {
        remaining: (PLANS[plan].monthlyCredits as number) === 999999 ? 'Unlimited' : Number(updatedCredits.creditsRemaining),
        plan,
        nextResetDate: periodEnd.toISOString(),
      }
    });
  } catch (err: any) {
    console.error('[Verify]', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/v2/subscriptions/webhook (Paystack webhook)
router.post('/webhook', async (req, res) => {
  // Always respond 200 immediately so Paystack doesn't retry
  res.sendStatus(200);
  try {
    const signature = req.headers['x-paystack-signature'] as string;
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { event, data } = await paymentProvider.handleWebhook(payload, signature);

    if (event === 'charge.success') {
      const { userId, plan, billingCycle } = data.metadata || {};
      if (!userId || !plan) return;

      // Idempotency: skip if already processed
      const { Database } = await import('../../models');
      const existing = await Database.execute(
        'SELECT id FROM PaymentHistory WHERE reference = ? AND status = ?',
        [data.reference, 'success']
      );
      if (existing.rows.length > 0) return;

      const typedPlan = plan as PlanId;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + (billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000);

      await UserCreditsModel.upgradePlan(userId, typedPlan);
      await SubscriptionModel.upsert(userId, {
        plan: typedPlan,
        status: 'active',
        billingCycle: billingCycle || 'monthly',
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd.toISOString(),
        paystackCustomerId: data.customer?.customer_code || null,
        paystackSubscriptionCode: null
      });
      await PaymentHistoryModel.record({
        userId,
        reference: data.reference,
        plan: typedPlan,
        billingCycle: billingCycle || 'monthly',
        amount: data.amount,
        currency: 'KES',
        status: 'success',
        paystackCustomerId: data.customer?.customer_code || undefined,
      });
      await Notification.create({
        userId,
        type: 'success',
        title: `Upgraded to ${PLANS[typedPlan].name} plan`,
        message: `Payment confirmed. You now have ${PLANS[typedPlan].monthlyCredits} credits.`,
      });
    }

    if (event === 'subscription.disable') {
      const userId = data.metadata?.userId;
      if (userId) {
        await SubscriptionModel.upsert(userId, { plan: 'free', status: 'cancelled', billingCycle: 'monthly', currentPeriodStart: null, currentPeriodEnd: null, paystackCustomerId: null, paystackSubscriptionCode: null });
        await UserCreditsModel.upgradePlan(userId, 'free');
        await Notification.create({
          userId,
          type: 'info',
          title: 'Subscription cancelled',
          message: 'Your subscription has been cancelled. You have been moved to the free plan.',
        });
      }
    }
  } catch (err: any) {
    console.error('[Webhook]', err.message);
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

// GET /api/v2/subscriptions/payment-history
router.get('/payment-history', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const history = await PaymentHistoryModel.findByUser(req.user!.id);
    res.json({
      success: true,
      data: {
        payments: history.map((p: any) => ({
          id: String(p.id),
          reference: String(p.reference),
          plan: String(p.plan),
          billingCycle: String(p.billingCycle),
          amount: Number(p.amount),
          currency: String(p.currency),
          status: String(p.status),
          createdAt: String(p.createdAt),
        })),
        total: history.length,
      }
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/v2/subscriptions/recover — user-triggered re-verify for missed callbacks
router.post('/recover', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ message: 'Reference required' });

    // Check if already processed
    const { Database } = await import('../../models');
    const existing = await Database.execute(
      'SELECT * FROM PaymentHistory WHERE reference = ? AND userId = ? AND status = ?',
      [reference, req.user!.id, 'success']
    );
    if (existing.rows.length > 0) {
      const credits = await ensureCredits(req.user!.id);
      return res.json({ success: true, message: 'Already processed', plan: credits.plan });
    }

    // Re-verify with Paystack
    const result = await paymentProvider.verifyPayment(reference);
    if (!result.success) return res.status(400).json({ message: 'Payment not confirmed by Paystack' });

    // Verify this reference belongs to this user via metadata
    const plan = result.plan as PlanId;
    if (!PLANS[plan]) return res.status(400).json({ message: 'Invalid plan in payment metadata' });

    const now = new Date();
    const periodEnd = new Date(now.getTime() + (result.billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000);

    await SubscriptionModel.upsert(req.user!.id, {
      plan, status: 'active', billingCycle: result.billingCycle,
      currentPeriodStart: now.toISOString(), currentPeriodEnd: periodEnd.toISOString(),
      paystackCustomerId: result.customerId || null, paystackSubscriptionCode: null
    });
    await UserCreditsModel.upgradePlan(req.user!.id, plan);
    await PaymentHistoryModel.record({
      userId: req.user!.id, reference: result.reference, plan,
      billingCycle: result.billingCycle, amount: result.amount,
      currency: 'KES', status: 'success', paystackCustomerId: result.customerId || undefined,
    });
    await Notification.create({
      userId: req.user!.id, type: 'success',
      title: 'Payment recovered',
      message: `Your ${PLANS[plan].name} plan has been activated after recovery.`,
    });

    const updatedCredits = await ensureCredits(req.user!.id);
    res.json({ success: true, plan, message: `Plan recovered: ${PLANS[plan].name}`, credits: { remaining: Number(updatedCredits.creditsRemaining) } });
  } catch (err: any) {
    console.error('[Recover]', err.message);
    res.status(500).json({ message: err.message });
  }
});

export default router;
