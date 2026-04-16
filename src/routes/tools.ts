import { Router, Response } from 'express';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { generateHooks, generateCaptions } from '../services/toolsService';
import { greenscreenQueue, getJobResult } from '../services/greenscreenQueue';
import { slideshowQueue, getSlideshowResult } from '../services/slideshowQueue';
import { uploadToR2 } from '../utils/r2Storage';
import { db, generateUUID } from '../models';
import { creditGuard } from '../v2/guards/creditGuard';

const router = Router();
router.use(authenticateUser);

// POST /api/tools/hooks/generate
router.post('/hooks/generate', creditGuard('generate_hooks'), async (req: AuthRequest, res: Response) => {
  try {
    const { topic, count = 5 } = req.body;
    if (!topic) return res.status(400).json({ success: false, message: 'topic is required' });

    const hooks = await generateHooks(topic, Math.min(Number(count), 10));
    await (req as any).consumeCredits(topic);
    res.json({ success: true, hooks });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tools/captions/generate
router.post('/captions/generate', creditGuard('generate_caption'), async (req: AuthRequest, res: Response) => {
  try {
    const { topic, platforms = ['instagram', 'tiktok', 'linkedin'] } = req.body;
    if (!topic) return res.status(400).json({ success: false, message: 'topic is required' });

    const result = await generateCaptions(topic, platforms);
    await (req as any).consumeCredits(topic);
    res.json({ success: true, ...result });
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

// POST /api/tools/upload — upload a file to R2, return its URL
router.post('/upload', (req: AuthRequest, res: Response, next) => {
  uploadToR2.single('media')(req, res, (err: any) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file as any;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const url = process.env.R2_PUBLIC_URL && file.key
      ? `${process.env.R2_PUBLIC_URL}/${file.key}`
      : file.location;
    res.json({ success: true, url });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/tools/carousel/generate-content
router.post('/carousel/generate-content', creditGuard('generate_carousel'), async (req: AuthRequest, res: Response) => {
  try {
    const { topic, imageCount, style = 'Clean Minimal' } = req.body;
    if (!topic || !imageCount) return res.status(400).json({ success: false, message: 'topic and imageCount are required' });

    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const styleGuide: Record<string, string> = {
      'Clean Minimal': 'Clean, minimal copy. Short punchy title (max 6 words). 2-3 short bullet points.',
      'Bold Typography': 'Bold, impactful statements. Title is a strong claim (max 5 words). 2-3 punchy bullets.',
      'Educational Infographic': 'Educational tone. Title is a clear lesson heading. 3-4 informative bullet points.',
    };

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are a social media content strategist. Generate carousel slide content. Style: ${styleGuide[style] || styleGuide['Clean Minimal']}. Return ONLY valid JSON in this exact shape: {"slides":[{"slideNumber":1,"title":"string","bullets":["string"]}]}` },
        { role: 'user', content: `Topic: "${topic}". Generate content for exactly ${imageCount} slides.` }
      ],
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content || '{"slides":[]}';
    console.log('[carousel] raw GPT response:', raw.slice(0, 300));
    const parsed = JSON.parse(raw);
    // GPT always returns an object with json_object mode — find the array value
    const slides = Array.isArray(parsed.slides) ? parsed.slides
      : Array.isArray(parsed.data) ? parsed.data
      : Array.isArray(Object.values(parsed).find(v => Array.isArray(v))) ? Object.values(parsed).find(v => Array.isArray(v)) as any[]
      : [];

    await (req as any).consumeCredits(topic);
    res.json({ success: true, slides });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
router.post('/greenscreen', async (req: AuthRequest, res: Response) => {
  try {
    const { videoUrl, backgroundUrl, caption = '', chromaColor = '00b140', tolerance = 30 } = req.body;
    if (!videoUrl || !backgroundUrl) {
      return res.status(400).json({ success: false, message: 'videoUrl and backgroundUrl are required' });
    }
    const job = await greenscreenQueue.add('process', {
      videoUrl, backgroundUrl, caption,
      chromaColor: String(chromaColor).replace(/^#/, '').replace(/^0x/i, ''),
      tolerance: Number(tolerance),
      userId: req.user!.id
    });
    res.json({ success: true, jobId: job.id });
  } catch (err: any) {
    console.error('[POST /api/tools/greenscreen] Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tools/greenscreen/status/:jobId — poll for result
router.get('/greenscreen/status/:jobId', (req: AuthRequest, res: Response) => {
  const result = getJobResult(req.params.jobId);
  if (!result) return res.json({ success: true, status: 'processing' });
  res.json({ success: true, ...result });
});

// POST /api/tools/slideshow — enqueue slideshow job
router.post('/slideshow', creditGuard('generate_slideshow'), async (req: AuthRequest, res: Response) => {
  try {
    const { imageUrls, captions = [], transition = 'fade' } = req.body;
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({ success: false, message: 'imageUrls array is required' });
    }
    const job = await slideshowQueue.add('process', {
      imageUrls, captions, transition, userId: req.user!.id
    });
    await (req as any).consumeCredits(`${imageUrls.length} images`);
    res.json({ success: true, jobId: job.id });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/tools/slideshow/status/:jobId
router.get('/slideshow/status/:jobId', (req: AuthRequest, res: Response) => {
  const result = getSlideshowResult(req.params.jobId);
  if (!result) return res.json({ success: true, status: 'processing' });
  res.json({ success: true, ...result });
});

export default router;
