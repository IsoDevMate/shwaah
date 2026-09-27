import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/ResponseUtil';
import { PresenceAudit } from '../models/presenceAudit';
import {
  analyzeInstagramMedia,
  generateAuditFix,
  getOwnedInstagramMedia,
  listInstagramMedia,
} from '../services/presenceAuditService';
import { creditGuard } from '../v2/guards/creditGuard';

const router = Router();
router.use(authenticateUser);

const createSchema = z.object({
  accountId: z.string().min(1),
  mediaId: z.string().min(1),
});

router.get('/instagram/media', async (req: AuthRequest, res: Response) => {
  try {
    const media = await listInstagramMedia(req.user!.id);
    return ResponseUtil.success(res, 200, { media }, 'Instagram posts retrieved');
  } catch (error: any) {
    const status = error.response?.status === 401 ? 401 : 502;
    const message = status === 401
      ? 'Instagram access expired. Reconnect the account.'
      : 'Could not retrieve Instagram posts.';
    return ResponseUtil.error(res, status, message, error);
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return ResponseUtil.error(res, 400, 'accountId and mediaId are required', parsed.error);
  }

  try {
    const media = await getOwnedInstagramMedia(
      req.user!.id,
      parsed.data.accountId,
      parsed.data.mediaId
    );
    const report = await analyzeInstagramMedia(media);
    const audit = await PresenceAudit.create({
      userId: req.user!.id,
      socialAccountId: media.accountId,
      platformMediaId: media.id,
      mediaType: media.mediaType,
      mediaUrl: media.mediaUrl,
      thumbnailUrl: media.thumbnailUrl,
      permalink: media.permalink,
      caption: media.caption,
      report,
    });
    return ResponseUtil.success(
      res,
      201,
      { ...audit, fixLocked: true },
      'Presence audit complete'
    );
  } catch (error: any) {
    const notFound = /not found|disconnected/i.test(error.message || '');
    return ResponseUtil.error(
      res,
      notFound ? 404 : 502,
      notFound ? error.message : 'Could not analyze this Instagram post.',
      error
    );
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const audits = await PresenceAudit.findByUser(req.user!.id);
  return ResponseUtil.success(
    res,
    200,
    audits.map(audit => ({ ...audit, fixLocked: !audit.fix })),
    'Presence audit history retrieved'
  );
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const audit = await PresenceAudit.findByIdForUser(req.params.id, req.user!.id);
  if (!audit) return ResponseUtil.error(res, 404, 'Presence audit not found');
  return ResponseUtil.success(res, 200, { ...audit, fixLocked: !audit.fix }, 'Presence audit retrieved');
});

router.post(
  '/:id/unlock-fix',
  creditGuard('presence_audit_fix'),
  async (req: AuthRequest, res: Response) => {
    try {
      const audit = await PresenceAudit.findByIdForUser(req.params.id, req.user!.id);
      if (!audit) return ResponseUtil.error(res, 404, 'Presence audit not found');
      if (audit.fix) {
        return ResponseUtil.success(res, 200, { fix: audit.fix, fixLocked: false }, 'Fix already unlocked');
      }

      const fix = await generateAuditFix(audit);
      await PresenceAudit.saveFix(audit.id, req.user!.id, fix);
      await (req as any).consumeCredits(`audit ${audit.id}`);
      return ResponseUtil.success(res, 200, { fix, fixLocked: false }, 'Presence audit fix unlocked');
    } catch (error) {
      return ResponseUtil.error(res, 502, 'Could not unlock the audit fix.', error);
    }
  }
);

export default router;
