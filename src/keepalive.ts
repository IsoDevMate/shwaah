import * as cron from 'node-cron';
import * as https from 'https';

const RENDER_URL = 'https://shwaah.onrender.com';

// Ping every 14 minutes (Render free tier sleeps after 15 minutes)
cron.schedule('*/14 * * * *', () => {
  https.get(RENDER_URL, (res) => {
    console.log(`Keep-alive ping: ${res.statusCode} at ${new Date().toISOString()}`);
  }).on('error', (err) => {
    console.error('Keep-alive failed:', err.message);
  });
});

console.log('Keep-alive cron started - pinging every 14 minutes');
