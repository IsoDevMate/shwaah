// Loosely coupled payment interface — swap provider by changing one import
export interface PaymentResult {
  success: boolean;
  reference: string;
  plan: string;
  billingCycle: string;
  customerId?: string;
  subscriptionCode?: string;
  amount: number;
}

export interface PaymentProvider {
  initializePayment(params: { email: string; plan: string; billingCycle: 'monthly' | 'yearly'; userId: string; callbackUrl: string }): Promise<{ checkoutUrl: string; reference: string }>;
  verifyPayment(reference: string): Promise<PaymentResult>;
  handleWebhook(payload: any, signature: string): Promise<{ event: string; data: any }>;
}
