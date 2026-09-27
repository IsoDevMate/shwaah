import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { uploadFileToR2, deleteFileFromR2 } from '../utils/r2Storage';
import { VoiceNote } from '../models/voiceNote';

const router = Router();
router.use(authenticateUser);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  },
});

const metaSchema = z.object({
  title: z.string().max(120).optional(),
  source: z.enum(['record', 'upload']).default('upload'),
  durationMs: z.coerce.number().int().nonnegative().optional(),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const notes = await VoiceNote.findByUser(req.user!.id);
  return ResponseUtil.success(res, 200, notes, 'Voice notes retrieved');
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const note = await VoiceNote.findByIdForUser(req.params.id, req.user!.id);
  if (!note) return ResponseUtil.error(res, 404, 'Voice note not found');
  return ResponseUtil.success(res, 200, note, 'Voice note retrieved');
});

router.post('/', upload.single('audio'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return ResponseUtil.error(res, 400, 'audio file is required');

    const parsed = metaSchema.safeParse(req.body);
    if (!parsed.success) {
      return ResponseUtil.error(res, 400, 'Invalid voice note metadata', parsed.error);
    }

    const audioUrl = await uploadFileToR2(
      req.file.buffer,
      req.file.originalname || `voice-note-${Date.now()}.webm`,
      req.file.mimetype
    );

    const note = await VoiceNote.create({
      userId: req.user!.id,
      title: parsed.data.title || null,
      audioUrl,
      mimeType: req.file.mimetype,
      durationMs: parsed.data.durationMs ?? null,
      fileSize: req.file.size,
      source: parsed.data.source,
    });

    return ResponseUtil.success(res, 201, note, 'Voice note stored');
  } catch (error: any) {
    const message = /R2 not configured/i.test(error.message || '')
      ? 'Audio storage is not configured.'
      : 'Could not store voice note.';
    return ResponseUtil.error(res, 502, message, error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const note = await VoiceNote.deleteForUser(req.params.id, req.user!.id);
    if (!note) return ResponseUtil.error(res, 404, 'Voice note not found');
    await deleteFileFromR2(note.audioUrl).catch(() => undefined);
    return ResponseUtil.success(res, 200, null, 'Voice note deleted');
  } catch (error) {
    return ResponseUtil.error(res, 500, 'Could not delete voice note.', error);
  }
});

export default router;
