import OpenAI from 'openai';
import ffmpeg from 'fluent-ffmpeg';
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
  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `gs_video_${Date.now()}.mp4`);
  const bgPath = path.join(tmpDir, `gs_bg_${Date.now()}.jpg`);
  const outputPath = path.join(tmpDir, `gs_out_${Date.now()}.mp4`);

  // Download inputs
  await downloadFile(videoUrl, videoPath);
  await downloadFile(backgroundUrl, bgPath);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(bgPath)
      .input(videoPath)
      .complexFilter([
        // Scale background to match video size
        '[0:v]scale=1080:1920,setsar=1[bg]',
        // Chroma key: remove green (0x00b140), similarity 0.3, blend 0.1
        '[1:v]scale=1080:1920,chromakey=0x00b140:0.3:0.1[fg]',
        // Overlay fg on bg
        '[bg][fg]overlay=0:0[composited]',
        // Draw caption text
        `[composited]drawtext=text='${caption.replace(/'/g, "\\'")}':fontsize=48:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-100[out]`
      ])
      .outputOptions(['-map [out]', '-map 1:a?', '-c:v libx264', '-c:a aac', '-shortest'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });

  // Upload to R2
  const fileBuffer = fs.readFileSync(outputPath);
  const fileName = `greenscreen_${userId}_${Date.now()}.mp4`;
  const r2Url = await uploadFileToR2(fileBuffer, fileName, 'video/mp4');

  // Cleanup
  [videoPath, bgPath, outputPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });

  return r2Url;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(dest, Buffer.from(res.data));
}
