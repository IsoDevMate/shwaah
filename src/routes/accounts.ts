import { Router } from 'express';
import db from '../database';

const router = Router();

// Connect social account
router.post('/connect', async (req, res) => {
  try {
    const { user_id, platform, account_id, access_token, refresh_token, expires_at } = req.body;
    
    const result = await db.run(
      'INSERT INTO social_accounts (user_id, platform, account_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user_id, platform, account_id, access_token, refresh_token, expires_at]
    );
    
    res.json({ id: result.id, message: 'Account connected successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to connect account' });
  }
});

// Get connected accounts for user
router.get('/:userId', async (req, res) => {
  try {
    const accounts = await db.query(
      'SELECT id, platform, account_id FROM social_accounts WHERE user_id = ?',
      [req.params.userId]
    );
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Disconnect account
router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM social_accounts WHERE id = ?', [req.params.id]);
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

export default router;
