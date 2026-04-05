import axios from 'axios';
import crypto from 'crypto';
import type { PaymentProvider, PaymentResult } from './paymentProvider';
import { PLANS, type PlanId } from '../schemas';

// KES amounts (Paystack uses smallest currency unit — KES = 100 units per shilling)
const PLAN_PRICES_KES: Record<string, Record<string, number>> = {
  creator: { monthly: 5 * 100, yearly: 5 * 100 },   // KES 5 (test)
  pro:     { monthly: 10 * 100, yearly: 10 * 100 },  // KES 10 (test)
};

export class PaystackProvider implements PaymentProvider {
  private secretKey = process.env.PAYSTACK_SECRET_KEY!;
  private baseUrl = 'https://api.paystack.co';

  async initializePayment({ email, plan, billingCycle, userId, callbackUrl }: {
    email: string; plan: string; billingCycle: 'monthly' | 'yearly'; userId: string; callbackUrl: string;
  }) {
    if (plan === 'free') throw new Error('Free plan requires no payment')
    if (!this.secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured on the server')

    const amount = PLAN_PRICES_KES[plan]?.[billingCycle]
    if (!amount) throw new Error(`Invalid plan or billing cycle: ${plan}/${billingCycle}`)

    const reference = `SHW-${userId.substring(0, 8)}-${Date.now()}`

    try {
      const res = await axios.post(`${this.baseUrl}/transaction/initialize`, {
        email, amount, currency: 'KES', reference, callback_url: callbackUrl,
        metadata: { userId, plan, billingCycle }
      }, { headers: { Authorization: `Bearer ${this.secretKey}` } })
      return { checkoutUrl: res.data.data.authorization_url, reference }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message
      throw new Error(`Paystack error: ${msg}`)
    }
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
    const rawBody = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) throw new Error('Invalid webhook signature');

    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    return { event: parsed.event, data: parsed.data };
  }
}

// Export singleton — swap this import to change provider
export const paymentProvider: PaymentProvider = new PaystackProvider();
