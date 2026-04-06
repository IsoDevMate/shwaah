import { Router, Response } from 'express';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateHooks, createGreenscreenMeme } from '../services/toolsService';
import { db, generateUUID } from '../models';

const router = Router();
router.use(authenticateUser);

// POST /api/tools/hooks/generate
router.post('/hooks/generate', async (req: AuthRequest, res: Response) => {
  try {
    const { topic, count = 5 } = req.body;
    if (!topic) return res.status(400).json({ success: false, message: 'topic is required' });

    const hooks = await generateHooks(topic, Math.min(Number(count), 10));
    res.json({ success: true, hooks });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tools/hooks/save
router.post('/hooks/save', async (req: AuthRequest, res: Response) => {
  try {
    const { topic, hook } = req.body;
    if (!topic || !hook) return res.status(400).json({ success: false, message: 'topic and hook are required' });

    const id = generateUUID();
    await db.execute({
      sql: 'INSERT INTO SavedHooks (id, userId, topic, hook) VALUES (?, ?, ?, ?)',
      args: [id, req.user!.id, topic, hook]
    });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tools/hooks
router.get('/hooks', async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM SavedHooks WHERE userId = ? ORDER BY createdAt DESC',
      args: [req.user!.id]
    });
    res.json({ success: true, hooks: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/tools/hooks/:id
router.put('/hooks/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { hook } = req.body;
    if (!hook) return res.status(400).json({ success: false, message: 'hook is required' });

    await db.execute({
      sql: 'UPDATE SavedHooks SET hook = ? WHERE id = ? AND userId = ?',
      args: [hook, req.params.id, req.user!.id]
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/tools/hooks/:id
router.delete('/hooks/:id', async (req: AuthRequest, res: Response) => {
  try {
    await db.execute({
      sql: 'DELETE FROM SavedHooks WHERE id = ? AND userId = ?',
      args: [req.params.id, req.user!.id]
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tools/greenscreen
// Body: { videoUrl, backgroundUrl, caption }
router.post('/greenscreen', async (req: AuthRequest, res: Response) => {
  try {
    const { videoUrl, backgroundUrl, caption = '' } = req.body;
    if (!videoUrl || !backgroundUrl) {
      return res.status(400).json({ success: false, message: 'videoUrl and backgroundUrl are required' });
    }

    const outputUrl = await createGreenscreenMeme(videoUrl, backgroundUrl, caption, req.user!.id);
    res.json({ success: true, url: outputUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
