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

export type SlideshowTransition = 'fade' | 'slide' | 'zoom' | 'none';

// Burns caption text onto an image using sharp (no libfreetype needed)
async function addCaptionToImage(imgPath: string, caption: string, outPath: string): Promise<void> {
  const sharp = (await import('sharp')).default;
  const W = 480, H = 854;

  // Create a semi-transparent black bar as SVG with text
  const safeCaption = caption.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svgOverlay = Buffer.from(`
    <svg width="${W}" height="${H}">
      <rect x="0" y="${H - 100}" width="${W}" height="100" fill="rgba(0,0,0,0.55)" rx="0"/>
      <text x="${W / 2}" y="${H - 38}" font-size="22" fill="white" text-anchor="middle"
        font-family="Arial, sans-serif" font-weight="bold">${safeCaption}</text>
    </svg>`);

  await sharp(imgPath)
    .resize(W, H, { fit: 'cover' })
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .jpeg({ quality: 85 })
    .toFile(outPath);
}

export async function createSlideshow(
  imageUrls: string[],
  captions: string[],
  transition: SlideshowTransition = 'fade',
  userId: string
): Promise<string> {
  if (imageUrls.length < 1) throw new Error('At least one image required');

  const ffmpeg = (await import('fluent-ffmpeg')).default;
  const ffmpegPath = (await import('ffmpeg-static')).default;
  if (!ffmpegPath) throw new Error('ffmpeg-static binary not found');
  ffmpeg.setFfmpegPath(ffmpegPath);

  const tmpDir = os.tmpdir();
  const tag = `${userId}_${Date.now()}`;

  // Download all images and composite captions via sharp
  const imgPaths: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const raw = path.join(tmpDir, `slide_raw_${tag}_${i}.jpg`);
    await downloadFile(imageUrls[i], raw);
    const caption = (captions[i] || '').trim();
    if (caption) {
      const captioned = path.join(tmpDir, `slide_${tag}_${i}.jpg`);
      await addCaptionToImage(raw, caption, captioned);
      fs.unlinkSync(raw);
      imgPaths.push(captioned);
    } else {
      imgPaths.push(raw);
    }
  }

  const outputPath = path.join(tmpDir, `slideshow_${tag}.mp4`);
  const slideDuration = 3;
  const W = 480, H = 854;
  const fps = 25;
  const threads = Math.max(2, os.cpus().length - 1);

  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    imgPaths.forEach(p => cmd.input(p).inputOptions([`-loop 1`, `-t ${slideDuration}`]));

    const n = imgPaths.length;
    const filterParts: string[] = [];
    const scaledLabels: string[] = [];

    // Scale each image (caption already burned in by sharp)
    imgPaths.forEach((_, i) => {
      const label = `[v${i}]`;
      filterParts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}${label}`);
      scaledLabels.push(label);
    });

    if (n === 1 || transition === 'none') {
      filterParts.push(`${scaledLabels.join('')}concat=n=${n}:v=1:a=0[outv]`);
    } else {
      const xfadeMap: Record<SlideshowTransition, string> = {
        fade: 'fade', slide: 'slideleft', zoom: 'zoom', none: 'fade'
      };
      const xfadeType = xfadeMap[transition];
      const fadeDuration = 0.5;

      let prevLabel = scaledLabels[0];
      for (let i = 1; i < n; i++) {
        const outLabel = i === n - 1 ? '[outv]' : `[xf${i}]`;
        const offset = (slideDuration - fadeDuration) * i - fadeDuration * (i - 1);
        filterParts.push(`${prevLabel}${scaledLabels[i]}xfade=transition=${xfadeType}:duration=${fadeDuration}:offset=${offset}${outLabel}`);
        prevLabel = `[xf${i}]`;
      }
    }

    cmd
      .complexFilter(filterParts)
      .outputOptions(['-map [outv]', '-c:v libx264', '-preset ultrafast', '-crf 30', `-threads ${threads}`, '-pix_fmt yuv420p'])
      .output(outputPath)
      .on('end', () => { console.log('[slideshow] done'); resolve(); })
      .on('error', (err: Error) => { console.error('[slideshow] error:', err.message); reject(err); })
      .run();
  });

  const fileBuffer = fs.readFileSync(outputPath);
  const r2Url = await uploadFileToR2(fileBuffer, `slideshow_${tag}.mp4`, 'video/mp4');
  [...imgPaths, outputPath].forEach(f => { try { fs.unlinkSync(f); } catch {} });
  return r2Url;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  fs.writeFileSync(dest, Buffer.from(res.data));
}
