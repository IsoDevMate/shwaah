import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { Database, generateUUID } from '../models';
import OpenAI from 'openai';

const router = Router();
router.use(authenticateUser);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Save a bookmark
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { url, title, notes, format, niche, platform, thumbnailUrl } = req.body;
    if (!url) return ResponseUtil.error(res, 400, 'url is required');

    const id = generateUUID();
    await Database.execute(
      'INSERT INTO InspirationBookmarks (id, userId, url, title, notes, format, niche, platform, thumbnailUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user!.id, url, title ?? null, notes ?? null, format ?? null, niche ?? null, platform ?? null, thumbnailUrl ?? null]
    );
    return ResponseUtil.success(res, 201, { id, url, title, notes, format, niche, platform, thumbnailUrl }, 'Bookmark saved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Get all bookmarks (with optional filters)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { format, niche, platform } = req.query;
    const filters: string[] = ['userId = ?'];
    const params: any[] = [req.user!.id];

    if (format)   { filters.push('format = ?');   params.push(format); }
    if (niche)    { filters.push('niche = ?');     params.push(niche); }
    if (platform) { filters.push('platform = ?');  params.push(platform); }

    const result = await Database.execute(
      `SELECT * FROM InspirationBookmarks WHERE ${filters.join(' AND ')} ORDER BY createdAt DESC`,
      params
    );
    return ResponseUtil.success(res, 200, result.rows, 'Bookmarks retrieved');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Update a bookmark
router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const { title, notes, format, niche, platform, thumbnailUrl } = req.body;
    await Database.execute(
      `UPDATE InspirationBookmarks SET
        title = COALESCE(?, title), notes = COALESCE(?, notes),
        format = COALESCE(?, format), niche = COALESCE(?, niche),
        platform = COALESCE(?, platform), thumbnailUrl = COALESCE(?, thumbnailUrl)
       WHERE id = ? AND userId = ?`,
      [title ?? null, notes ?? null, format ?? null, niche ?? null, platform ?? null, thumbnailUrl ?? null, req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, null, 'Bookmark updated');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Delete a bookmark
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await Database.execute(
      'DELETE FROM InspirationBookmarks WHERE id = ? AND userId = ?',
      [req.params.id, req.user!.id]
    );
    return ResponseUtil.success(res, 200, null, 'Bookmark deleted');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

// Generate ideas from saved inspiration library
router.post('/generate-ideas', async (req: AuthRequest, res) => {
  try {
    const { topic, count = 5 } = req.body;

    // Pull user's bookmarks as context
    const result = await Database.execute(
      'SELECT title, notes, format, niche, platform, url FROM InspirationBookmarks WHERE userId = ? ORDER BY createdAt DESC LIMIT 20',
      [req.user!.id]
    );

    const bookmarks = result.rows;
    const libraryContext = bookmarks.length
      ? bookmarks.map((b: any) =>
          `- "${b.title || b.url}" [${b.platform || 'unknown'}] format:${b.format || 'unknown'} niche:${b.niche || 'unknown'}${b.notes ? ` | notes: ${b.notes}` : ''}`
        ).join('\n')
      : 'No saved inspirations yet.';

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a creative content strategist. The user has saved the following content as inspiration:\n\n${libraryContext}\n\nUse this as context to generate fresh, original content ideas that match their taste and style. Return ONLY a JSON object: {"ideas": ["idea1", "idea2", ...]}`
        },
        {
          role: 'user',
          content: `Generate ${count} content ideas${topic ? ` about: "${topic}"` : ' based on my saved inspiration library'}. Make them specific and actionable.`
        }
      ],
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0].message.content || '{"ideas":[]}';
    const parsed = JSON.parse(raw);
    const ideas: string[] = Array.isArray(parsed) ? parsed : (parsed.ideas || Object.values(parsed)[0] || []);

    return ResponseUtil.success(res, 200, { ideas, basedOn: bookmarks.length }, 'Ideas generated');
  } catch (e: any) {
    return ResponseUtil.error(res, 500, e.message);
  }
});

export default router;
