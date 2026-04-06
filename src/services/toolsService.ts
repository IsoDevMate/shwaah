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
  console.log(`[greenscreen] Starting for user=${userId} video=${videoUrl} bg=${backgroundUrl}`);

  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const ffmpegPath = (await import('ffmpeg-static')).default;
  if (!ffmpegPath) throw new Error('ffmpeg-static binary not found');
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log(`[greenscreen] Using ffmpeg at: ${ffmpegPath}`);

  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `gs_video_${Date.now()}.mp4`);
  const bgPath = path.join(tmpDir, `gs_bg_${Date.now()}.jpg`);
  const outputPath = path.join(tmpDir, `gs_out_${Date.now()}.mp4`);

  console.log(`[greenscreen] Downloading inputs...`);
  await downloadFile(videoUrl, videoPath);
  await downloadFile(backgroundUrl, bgPath);
  console.log(`[greenscreen] Downloads complete, running ffmpeg...`);

  await new Promise<void>((resolve, reject) => {
    // drawtext requires libfreetype which ffmpeg-static doesn't include.
    // Build filter chain without it; caption is overlaid client-side or skipped.
    const filters = [
      '[0:v]scale=1080:1920,setsar=1[bg]',
      '[1:v]scale=1080:1920,chromakey=0x00b140:0.3:0.1[fg]',
      '[bg][fg]overlay=0:0[out]',
    ];

    ffmpeg()
      .input(bgPath)
      .input(videoPath)
      .complexFilter(filters)
      .outputOptions(['-map [out]', '-map 1:a?', '-c:v libx264', '-c:a aac', '-shortest'])
      .output(outputPath)
      .on('start', (cmd: string) => console.log('[greenscreen] ffmpeg cmd:', cmd))
      .on('stderr', (line: string) => console.log('[greenscreen] ffmpeg:', line))
      .on('end', () => { console.log('[greenscreen] ffmpeg done'); resolve(); })
      .on('error', (err: Error) => { console.error('[greenscreen] ffmpeg error:', err.message); reject(err); })
      .run();
  });

  console.log(`[greenscreen] Uploading to R2...`);
  const fileBuffer = fs.readFileSync(outputPath);
  const fileName = `greenscreen_${userId}_${Date.now()}.mp4`;
  const r2Url = await uploadFileToR2(fileBuffer, fileName, 'video/mp4');
  console.log(`[greenscreen] Done, url=${r2Url}`);

  [videoPath, bgPath, outputPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });

  return r2Url;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(dest, Buffer.from(res.data));
}
