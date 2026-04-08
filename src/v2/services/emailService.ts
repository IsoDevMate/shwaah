import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOTPEmail(to: string, otp: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email] Resend not configured, OTP:', otp);
    return;
  }
  await resend.emails.send({
    from: `Shwaah <noreply@mabcaslabs.com>`,
    to,
    subject: `Your verification code: ${otp}`,
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
        <h2 style="color:#6366f1">Verify your email</h2>
        <p>Enter this code to complete your sign up:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111;margin:24px 0">${otp}</div>
        <p style="color:#6b7280;font-size:13px">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email] Resend not configured, reset URL:', resetUrl);
    return;
  }
  await resend.emails.send({
    from: `Shwaah <noreply@mabcaslabs.com>`,
    to,
    subject: 'Reset your Shwaah password',
    html: `
      <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px">
        <h2 style="color:#6366f1">Reset your password</h2>
        <p>Click the button below to reset your password. This link expires in 1 hour.</p>
        <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Reset Password</a>
        <p style="color:#6b7280;font-size:13px">If you didn't request this, ignore this email.</p>
      </div>
    `
  });
}

export async function sendReceiptEmail(to: string, data: {
  name: string;
  plan: string;
  amount: number;
  currency: string;
  reference: string;
  creditsAllocated: number | string;
  billingCycle: string;
  nextBillingDate: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[Email] Resend not configured, skipping receipt email');
    return;
  }

  const amountFormatted = `${data.currency} ${(data.amount / 100).toFixed(2)}`;

  await resend.emails.send({
    from: `Shwaah <noreply@${process.env.EMAIL_DOMAIN || 'yourdomain.com'}>`,
    to,
    subject: `Payment Receipt - ${data.plan} Plan`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:#6366f1">Payment Successful 🎉</h2>
        <p>Hi ${data.name},</p>
        <p>Your payment was successful. Here's your receipt:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 0;color:#6b7280">Plan</td>
            <td style="padding:8px 0;font-weight:600;text-transform:capitalize">${data.plan}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 0;color:#6b7280">Amount</td>
            <td style="padding:8px 0;font-weight:600">${amountFormatted}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 0;color:#6b7280">Billing</td>
            <td style="padding:8px 0;text-transform:capitalize">${data.billingCycle}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 0;color:#6b7280">Credits</td>
            <td style="padding:8px 0;font-weight:600">${data.creditsAllocated === 999999 ? 'Unlimited' : data.creditsAllocated}</td>
          </tr>
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px 0;color:#6b7280">Reference</td>
            <td style="padding:8px 0;font-family:monospace;font-size:12px">${data.reference}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#6b7280">Next billing</td>
            <td style="padding:8px 0">${data.nextBillingDate}</td>
          </tr>
        </table>
        <p style="color:#6b7280;font-size:13px">Thank you for subscribing to Shwaah!</p>
      </div>
    `
  });
}
