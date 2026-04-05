import axios from 'axios';
import crypto from 'crypto';
import type { PaymentProvider, PaymentResult } from './paymentProvider';
import { PLANS, type PlanId } from '../schemas';

// KES amounts (Paystack uses smallest currency unit — KES kobo = cents)
const PLAN_PRICES_KES: Record<string, Record<string, number>> = {
  creator: { monthly: 3800_00, yearly: 38000_00 },  // ~KES 3,800/mo, 38,000/yr
  pro:     { monthly: 7700_00, yearly: 77000_00 },   // ~KES 7,700/mo, 77,000/yr
};

export class PaystackProvider implements PaymentProvider {
  private secretKey = process.env.PAYSTACK_SECRET_KEY!;
  private baseUrl = 'https://api.paystack.co';

  async initializePayment({ email, plan, billingCycle, userId, callbackUrl }: {
    email: string; plan: string; billingCycle: 'monthly' | 'yearly'; userId: string; callbackUrl: string;
  }) {
    if (plan === 'free') throw new Error('Free plan requires no payment');

    const amount = PLAN_PRICES_KES[plan]?.[billingCycle];
    if (!amount) throw new Error(`Invalid plan or billing cycle: ${plan}/${billingCycle}`);

    const reference = `SHW-${userId.substring(0, 8)}-${Date.now()}`;

    const res = await axios.post(`${this.baseUrl}/transaction/initialize`, {
      email,
      amount,
      currency: 'KES',
      reference,
      callback_url: callbackUrl,
      metadata: { userId, plan, billingCycle }
    }, {
      headers: { Authorization: `Bearer ${this.secretKey}` }
    });

    return { checkoutUrl: res.data.data.authorization_url, reference };
  }

  async verifyPayment(reference: string): Promise<PaymentResult> {
    const res = await axios.get(`${this.baseUrl}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` }
    });

    const tx = res.data.data;
    const success = tx.status === 'success';
    const { userId, plan, billingCycle } = tx.metadata || {};

    return {
      success,
      reference,
      plan: plan || 'free',
      billingCycle: billingCycle || 'monthly',
      customerId: tx.customer?.customer_code,
      amount: tx.amount
    };
  }

  async handleWebhook(payload: any, signature: string) {
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) throw new Error('Invalid webhook signature');

    return { event: payload.event, data: payload.data };
  }
}

// Export singleton — swap this import to change provider
export const paymentProvider: PaymentProvider = new PaystackProvider();
