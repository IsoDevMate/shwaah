import express from 'express';

const router = express.Router();

// Instagram webhook verification (GET)
router.get('/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Instagram webhook events (POST)
router.post('/instagram', (req, res) => {
  console.log('Webhook event received:', JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

export default router;
