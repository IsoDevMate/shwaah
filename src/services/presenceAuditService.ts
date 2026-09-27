import axios from 'axios';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';
import { SocialAccount } from '../models/tursoModels';
import { decrypt } from '../utils/crypto';
import { refreshTokenIfNeeded } from './socialService';
import { PresenceAuditReport, PresenceAuditRecord } from '../models/presenceAudit';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const grade = z.enum(['Low', 'Fair', 'Good', 'Great']);
const dimension = z.object({
  grade,
  why: z.string().min(1),
  painPoint: z.string().min(1),
});
const reportSchema = z.object({
  overallGrade: grade,
  summary: z.string().min(1),
  hook: dimension,
  relatability: dimension,
  retention: dimension,
});

export interface InstagramMedia {
  id: string;
  accountId: string;
  accountUsername: string;
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl: string;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string;
}

type AccountRow = Record<string, unknown>;

async function getInstagramAccount(userId: string, accountId: string) {
  const accounts = await SocialAccount.findByUserAndPlatforms(userId, ['instagram']);
  const account = accounts.find((item: any) => String(item.id) === accountId) as AccountRow | undefined;
  if (!account) throw new Error('Instagram account not found or disconnected');
  return refreshTokenIfNeeded(account).catch(() => account);
}

function tokenFor(account: AccountRow) {
  try {
    return decrypt(String(account.accessToken));
  } catch {
    return String(account.accessToken);
  }
}

async function fetchAccountMedia(account: AccountRow): Promise<InstagramMedia[]> {
  const token = tokenFor(account);
  const response = await axios.get('https://graph.instagram.com/me/media', {
    params: {
      fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp',
      limit: 50,
      access_token: token,
    },
  });

  return (response.data?.data || []).map((item: any) => ({
    id: String(item.id),
    accountId: String(account.id),
    accountUsername: String(account.platformUsername || 'Instagram'),
    caption: String(item.caption || ''),
    mediaType: item.media_type,
    mediaUrl: String(item.media_url || ''),
    thumbnailUrl: item.thumbnail_url ? String(item.thumbnail_url) : null,
    permalink: item.permalink ? String(item.permalink) : null,
    timestamp: String(item.timestamp || ''),
  }));
}

export async function listInstagramMedia(userId: string) {
  const accounts = await SocialAccount.findByUserAndPlatforms(userId, ['instagram']);
  const groups = await Promise.all(
    accounts.map((account: any) =>
      refreshTokenIfNeeded(account)
        .catch(() => account)
        .then(fetchAccountMedia)
    )
  );
  return groups.flat().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getOwnedInstagramMedia(
  userId: string,
  accountId: string,
  mediaId: string
) {
  const account = await getInstagramAccount(userId, accountId);
  const media = await fetchAccountMedia(account);
  const selected = media.find(item => item.id === mediaId);
  if (!selected) throw new Error('Instagram post not found on this connected account');
  return selected;
}

async function videoFrames(mediaUrl: string): Promise<string[]> {
  const fluentFfmpeg = (await import('fluent-ffmpeg')).default;
  const ffmpegPath = (await import('ffmpeg-static')).default;
  if (!ffmpegPath) return [];
  fluentFfmpeg.setFfmpegPath(ffmpegPath);

  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'shwaah-audit-'));
  try {
    await new Promise<void>((resolve, reject) => {
      fluentFfmpeg(mediaUrl)
        .screenshots({ count: 3, folder, filename: 'frame-%i.jpg', size: '720x?' })
        .on('end', () => resolve())
        .on('error', reject);
    });
    const names = (await fs.readdir(folder)).sort();
    return Promise.all(
      names.map(async name => {
        const bytes = await fs.readFile(path.join(folder, name));
        return `data:image/jpeg;base64,${bytes.toString('base64')}`;
      })
    );
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
}

async function visualInputs(media: InstagramMedia) {
  if (media.mediaType === 'VIDEO') {
    const frames = await videoFrames(media.mediaUrl).catch(() => []);
    if (frames.length) return frames;
  }
  const fallback = media.thumbnailUrl || media.mediaUrl;
  return fallback ? [fallback] : [];
}

export async function analyzeInstagramMedia(media: InstagramMedia): Promise<PresenceAuditReport> {
  const visuals = await visualInputs(media);
  const content: any[] = [
    {
      type: 'text',
      text: [
        'Audit this Instagram post as a rigorous content strategist.',
        `Media type: ${media.mediaType}`,
        `Caption: ${media.caption || '(no caption)'}`,
        'Grade Hook, Relatability, and Retention as Low/Fair/Good/Great.',
        'Be specific to visible/caption evidence. Do not promise virality or invent percentages.',
        'For each dimension, explain why and name one concrete pain point.',
        'Return JSON only.',
      ].join('\n'),
    },
    ...visuals.map(url => ({ type: 'image_url', image_url: { url, detail: 'low' } })),
  ];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_AUDIT_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You give honest, evidence-grounded social content audits. Output the requested JSON object only.',
      },
      { role: 'user', content },
    ],
  });

  const parsed = JSON.parse(completion.choices[0].message.content || '{}');
  return reportSchema.parse(parsed);
}

export async function generateAuditFix(audit: PresenceAuditRecord) {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_AUDIT_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a practical content editor. Preserve the creator’s voice. Never promise virality.',
      },
      {
        role: 'user',
        content: [
          'Create a concise fix plan for this Instagram post.',
          `Caption: ${audit.caption || '(none)'}`,
          `Audit: ${JSON.stringify(audit.report)}`,
          'Give: 1 stronger opening hook, 1 story/retention sequence, and 1 rewritten caption.',
          'Use clear headings and concrete language.',
        ].join('\n'),
      },
    ],
  });
  return completion.choices[0].message.content?.trim() || 'No fix was generated.';
}
