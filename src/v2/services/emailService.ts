import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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
  if (!process.env.SMTP_USER) {
    console.log('[Email] SMTP not configured, skipping receipt email');
    return;
  }

  const amountFormatted = `${data.currency} ${(data.amount / 100).toFixed(2)}`;

  await transporter.sendMail({
    from: `"Shwaah" <${process.env.SMTP_USER}>`,
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
