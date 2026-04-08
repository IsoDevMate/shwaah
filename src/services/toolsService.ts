import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { uploadFileToR2 } from '../utils/r2Storage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateHooks(topic: string, count: number = 5): Promise<string[]> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a social media expert. Generate viral hooks for social media posts. Return ONLY a JSON array of strings, no explanation.'
      },
      {
        role: 'user',
        content: `Generate ${count} different viral hooks for the topic: "${topic}". Return as JSON array.`
      }
    ],
    response_format: { type: 'json_object' }
  });

  const raw = completion.choices[0].message.content || '{"hooks":[]}';
  const parsed = JSON.parse(raw);
  // handle both {"hooks":[...]} and direct array
  return Array.isArray(parsed) ? parsed : (parsed.hooks || Object.values(parsed)[0] || []);
}

export async function createGreenscreenMeme(
  videoUrl: string,
  backgroundUrl: string,
  caption: string,
  userId: string
): Promise<string> {
  console.log(`[greenscreen] Starting for user=${userId}`);

  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const ffmpegPath = (await import('ffmpeg-static')).default;
  if (!ffmpegPath) throw new Error('ffmpeg-static binary not found');
  ffmpeg.setFfmpegPath(ffmpegPath);

  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `gs_video_${Date.now()}.mp4`);
  const bgPath = path.join(tmpDir, `gs_bg_${Date.now()}.jpg`);
  const outputPath = path.join(tmpDir, `gs_out_${Date.now()}.mp4`);

  await downloadFile(videoUrl, videoPath);
  await downloadFile(backgroundUrl, bgPath);

  await new Promise<void>((resolve, reject) => {
    const filters = [
      '[0:v]scale=480:854,setsar=1[bg]',
      '[1:v]scale=480:854,chromakey=0x00b140:0.3:0.1[fg]',
      '[bg][fg]overlay=0:0[out]',
    ];

    ffmpeg()
      .input(bgPath)
      .input(videoPath)
      .complexFilter(filters)
      .outputOptions([
        '-map [out]', '-map 1:a?',
        '-c:v libx264', '-preset ultrafast', '-crf 30',
        '-c:a aac', '-shortest',
        `-threads ${Math.max(2, os.cpus().length - 1)}`,
      ])
      .output(outputPath)
      .on('end', () => { console.log('[greenscreen] ffmpeg done'); resolve(); })
      .on('error', (err: Error) => { console.error('[greenscreen] ffmpeg error:', err.message); reject(err); })
      .run();
  });

  const fileBuffer = fs.readFileSync(outputPath);
  const fileName = `greenscreen_${userId}_${Date.now()}.mp4`;
  const r2Url = await uploadFileToR2(fileBuffer, fileName, 'video/mp4');
  console.log(`[greenscreen] Done, url=${r2Url}`);

  [videoPath, bgPath, outputPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });

  return r2Url;
}

export async function generateCaptions(topic: string, platforms: string[]): Promise<{ captions: Record<string, string>; hashtags: string[] }> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a social media copywriter. Return ONLY valid JSON with keys "captions" (object mapping platform to caption string) and "hashtags" (array of hashtag strings without #).'
      },
      {
        role: 'user',
        content: `Write social media captions for the topic: "${topic}" for these platforms: ${platforms.join(', ')}. Also suggest 10 relevant hashtags. Return JSON.`
      }
    ],
    response_format: { type: 'json_object' }
  });
  const raw = completion.choices[0].message.content || '{"captions":{},"hashtags":[]}';
  return JSON.parse(raw);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(dest, Buffer.from(res.data));
}
