import express from 'express';
import { Notification } from '../models/tursoModels';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = express.Router();

router.get('/', authenticateUser, async (req: AuthRequest, res) => {
  try {
    const notifications = await Notification.findByUser(req.user!.id);
    const unread = await Notification.unreadCount(req.user!.id);
    res.json({ notifications, unread });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/:id/read', authenticateUser, async (req: AuthRequest, res) => {
  try {
    await Notification.markRead(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/read-all', authenticateUser, async (req: AuthRequest, res) => {
  try {
    await Notification.markAllRead(req.user!.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
