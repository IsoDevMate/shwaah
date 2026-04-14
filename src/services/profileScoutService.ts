import axios from 'axios';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';

export interface VideoData {
  id: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number; // seconds
  publishedAt: string;
  url: string;
  description: string;
}

export interface ScoutReport {
  platform: 'youtube' | 'tiktok';
  username: string;
  followerCount: number;
  profilePictureUrl: string;
  summary: {
    avgEngagementRate: number;
    avgViralityScore: number;
    totalViewsAnalyzed: number;
  };
  keywords: {
    topPerforming: { keyword: string; associatedViews: number; engagementRate: number }[];
    recommended: string[];
    toReconsider: string[];
  };
  hashtags: {
    tag: string;
    totalViews: number;
    avgEngagementRate: number;
    occurrences: number;
  }[];
  videos: {
    id: string;
    title: string;
    thumbnailUrl: string;
    viewCount: number;
    likeCount: number;
    engagementRate: number;
    viralityScore: number;
    duration: number;
    url: string;
  }[];
}

// Virality score: normalized 0-100 based on views relative to channel avg
function viralityScore(views: number, avgViews: number): number {
  if (avgViews === 0) return 0;
  const ratio = views / avgViews;
  // log scale: ratio of 1 = 50, 10x = ~83, 0.1x = ~17
  const score = 50 + 16.67 * Math.log10(ratio);
  return Math.min(100, Math.max(0, Math.round(score)));
}

function engagementRate(likes: number, comments: number, views: number): number {
  if (views === 0) return 0;
  return parseFloat(((likes + comments) / views).toFixed(4));
}

// Parse ISO 8601 duration (PT1M30S) to seconds
function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) + (parseInt(match[2] || '0') * 60) + parseInt(match[3] || '0');
}

const STOPWORDS = new Set(['the','a','an','and','or','in','on','at','to','for','of','with','is','are','was','were','this','that','it','i','my','your','we','you','how','what','why','when','do','did','be','have','has','not','but','so','if','as','by','from','up','out','about','get','got','just','like','can','will','all','more','new','one','its','our','their','they','he','she','his','her','me','us','no','yes','than','then','them','these','those','into','over','after','before','been','also','very','too','only','even','now','here','there','some','any','each','which','who','would','could','should','make','made','use','used','using','go','going','goes','gone','come','coming','see','seen','take','taken','give','given','know','known','think','thought','say','said','want','wanted','need','needed','look','looked','find','found','tell','told','ask','asked','seem','seemed','feel','felt','try','tried','leave','left','call','called','keep','kept','let','put','set','run','ran','move','moved','live','lived','believe','believed','hold','held','bring','brought','happen','happened','write','wrote','provide','provided','sit','sat','stand','stood','lose','lost','pay','paid','meet','met','include','included','continue','continued','learn','learned','change','changed','lead','led','understand','understood','watch','watched','follow','followed','stop','stopped','create','created','speak','spoke','read','spend','spent','grow','grew','open','opened','walk','walked','win','won','offer','offered','remember','remembered','love','loved','consider','considered','appear','appeared','buy','bought','wait','waited','serve','served','die','died','send','sent','expect','expected','build','built','stay','stayed','fall','fell','cut','reach','reached','kill','killed','remain','remained','suggest','suggested','raise','raised','pass','passed','sell','sold','require','required','report','reported','decide','decided','pull','pulled']);

function extractHashtags(videos: VideoData[]): ScoutReport['hashtags'] {
  const tagMap: Record<string, { views: number; er: number; count: number }> = {};

  for (const v of videos) {
    const text = `${v.title} ${v.description}`;
    const tags = text.match(/#[a-zA-Z0-9_]+/g) ?? [];
    const er = engagementRate(v.likeCount, v.commentCount, v.viewCount);
    for (const raw of tags) {
      const tag = raw.toLowerCase();
      if (!tagMap[tag]) tagMap[tag] = { views: 0, er: 0, count: 0 };
      tagMap[tag].views += v.viewCount;
      tagMap[tag].er += er;
      tagMap[tag].count += 1;
    }
  }

  return Object.entries(tagMap)
    .map(([tag, d]) => ({
      tag,
      totalViews: d.views,
      avgEngagementRate: parseFloat((d.er / d.count).toFixed(4)),
      occurrences: d.count,
    }))
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 20);
}

function extractKeywords(texts: string[]): string[] {
  const freq: Record<string, number> = {};
  for (const text of texts) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s#]/g, '').split(/\s+/);
    for (const w of words) {
      if (w.length > 2 && !STOPWORDS.has(w)) {
        freq[w] = (freq[w] || 0) + 1;
      }
    }
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(e => e[0]);
}

export async function scoutYouTube(username: string): Promise<ScoutReport> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured');

  // Resolve channel by handle or username
  let channelId: string;
  let channelTitle: string;
  let subscriberCount: number;
  let profilePic: string;

  const handle = username.startsWith('@') ? username.slice(1) : username;

  // Try forHandle first (YouTube handles), then forUsername (legacy)
  let channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,statistics', forHandle: handle, key: apiKey }
  });

  if (!channelRes.data.items?.length) {
    channelRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet,statistics', forUsername: handle, key: apiKey }
    });
  }

  if (!channelRes.data.items?.length) {
    // Search as fallback
    const searchRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', q: handle, type: 'channel', maxResults: 1, key: apiKey }
    });
    if (!searchRes.data.items?.length) throw new Error(`Channel not found: ${username}`);
    const found = searchRes.data.items[0];
    channelId = found.snippet.channelId;

    const detailRes = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'snippet,statistics', id: channelId, key: apiKey }
    });
    const ch = detailRes.data.items[0];
    channelTitle = ch.snippet.title;
    subscriberCount = parseInt(ch.statistics.subscriberCount || '0');
    profilePic = ch.snippet.thumbnails?.default?.url || '';
  } else {
    const ch = channelRes.data.items[0];
    channelId = ch.id;
    channelTitle = ch.snippet.title;
    subscriberCount = parseInt(ch.statistics.subscriberCount || '0');
    profilePic = ch.snippet.thumbnails?.default?.url || '';
  }

  // Fetch 50 most recent videos
  const uploadsRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    params: { part: 'id', channelId, order: 'date', type: 'video', maxResults: 50, key: apiKey }
  });

  const videoIds = uploadsRes.data.items.map((i: any) => i.id.videoId).join(',');
  if (!videoIds) throw new Error('No videos found for this channel');

  const videosRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
    params: { part: 'snippet,statistics,contentDetails', id: videoIds, key: apiKey }
  });

  const rawVideos: VideoData[] = videosRes.data.items.map((v: any) => ({
    id: v.id,
    title: v.snippet.title,
    thumbnailUrl: v.snippet.thumbnails?.medium?.url || '',
    viewCount: parseInt(v.statistics.viewCount || '0'),
    likeCount: parseInt(v.statistics.likeCount || '0'),
    commentCount: parseInt(v.statistics.commentCount || '0'),
    duration: parseDuration(v.contentDetails.duration),
    publishedAt: v.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    description: v.snippet.description || '',
  }));

  return buildReport('youtube', username, channelTitle, subscriberCount, profilePic, rawVideos);
}

puppeteerExtra.use(StealthPlugin());

async function scoutTikTokViaPuppeteer(handle: string): Promise<ScoutReport> {
  let browser: any = null;
  try {
    browser = await puppeteerExtra.launch({
      headless: 'shell' as any,
      args: chromium.args,
      executablePath: await chromium.executablePath(),
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Intercept TikTok's internal XHR responses for user info and video list
    let userInfoData: any = null;
    let videoListData: any = null;

    await page.setRequestInterception(true);
    page.on('request', (req: any) => req.continue());
    page.on('response', async (response: any) => {
      const url: string = response.url();
      try {
        if (url.includes('/api/user/detail') && !userInfoData) {
          const json = await response.json();
          if (json?.userInfo) userInfoData = json.userInfo;
        }
        if (url.includes('/api/post/item_list') && !videoListData) {
          const json = await response.json();
          if (json?.itemList) videoListData = json.itemList;
        }
      } catch { /* ignore parse errors */ }
    });

    await page.goto(`https://www.tiktok.com/@${handle}`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for XHR calls to complete
    await new Promise(r => setTimeout(r, 3000));

    if (!userInfoData) throw new Error('Could not intercept TikTok user data — bot detection may have triggered');

    const user = userInfoData.user;
    const stats = userInfoData.stats;
    const followerCount = stats?.followerCount || 0;
    const profilePic = user?.avatarMedium || '';

    // If video list wasn't intercepted, scroll to trigger it
    if (!videoListData) {
      await page.evaluate('window.scrollBy(0, 600)');
      await new Promise(r => setTimeout(r, 2000));
    }

    const rawVideos: VideoData[] = (videoListData || []).map((v: any) => ({
      id: v.id,
      title: v.desc || '',
      thumbnailUrl: v.video?.cover || '',
      viewCount: v.stats?.playCount || 0,
      likeCount: v.stats?.diggCount || 0,
      commentCount: v.stats?.commentCount || 0,
      duration: v.video?.duration || 0,
      publishedAt: new Date((v.createTime || 0) * 1000).toISOString(),
      url: `https://www.tiktok.com/@${handle}/video/${v.id}`,
      description: v.desc || '',
    }));

    return buildReport('tiktok', `@${handle}`, handle, followerCount, profilePic, rawVideos);
  } finally {
    if (browser) await browser.close();
  }
}

async function scoutTikTokViaRapidAPI(handle: string): Promise<ScoutReport> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) throw new Error('RAPIDAPI_KEY not configured');

  const profileRes = await axios.get('https://tiktok-scraper7.p.rapidapi.com/user/info', {
    params: { unique_id: handle },
    headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com' }
  });

  const user = profileRes.data.data?.user;
  const stats = profileRes.data.data?.stats;
  if (!user) throw new Error(`TikTok user not found: @${handle}`);

  const videosRes = await axios.get('https://tiktok-scraper7.p.rapidapi.com/user/posts', {
    params: { user_id: user.uid, count: 50 },
    headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': 'tiktok-scraper7.p.rapidapi.com' }
  });

  const rawVideos: VideoData[] = (videosRes.data.data?.videos || []).map((v: any) => ({
    id: v.video_id,
    title: v.title || v.desc || '',
    thumbnailUrl: v.cover || '',
    viewCount: v.play_count || 0,
    likeCount: v.digg_count || 0,
    commentCount: v.comment_count || 0,
    duration: v.duration || 0,
    publishedAt: new Date(v.create_time * 1000).toISOString(),
    url: `https://www.tiktok.com/@${handle}/video/${v.video_id}`,
    description: v.desc || '',
  }));

  return buildReport('tiktok', `@${handle}`, handle, stats?.followerCount || 0, user.avatarMedium || '', rawVideos);
}

export async function scoutTikTok(username: string): Promise<ScoutReport> {
  const handle = username.startsWith('@') ? username.slice(1) : username;

  // Skip Puppeteer if explicitly disabled or no Chrome available (e.g. Render free tier)
  if (process.env.PUPPETEER_SKIP === 'true') {
    return await scoutTikTokViaRapidAPI(handle);
  }

  try {
    return await scoutTikTokViaPuppeteer(handle);
  } catch (puppeteerErr: any) {
    console.warn(`[ProfileScout] Puppeteer failed for @${handle}: ${puppeteerErr.message} — falling back to RapidAPI`);
    return await scoutTikTokViaRapidAPI(handle);
  }
}

function buildReport(
  platform: 'youtube' | 'tiktok',
  inputUsername: string,
  displayName: string,
  followerCount: number,
  profilePictureUrl: string,
  rawVideos: VideoData[]
): ScoutReport {
  const totalViews = rawVideos.reduce((s, v) => s + v.viewCount, 0);
  const avgViews = rawVideos.length ? totalViews / rawVideos.length : 0;

  const videos = rawVideos.map(v => {
    const er = engagementRate(v.likeCount, v.commentCount, v.viewCount);
    return {
      id: v.id,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      engagementRate: er,
      viralityScore: viralityScore(v.viewCount, avgViews),
      duration: v.duration,
      url: v.url,
    };
  });

  const avgEngagementRate = videos.length
    ? parseFloat((videos.reduce((s, v) => s + v.engagementRate, 0) / videos.length).toFixed(4))
    : 0;
  const avgViralityScore = videos.length
    ? Math.round(videos.reduce((s, v) => s + v.viralityScore, 0) / videos.length)
    : 0;

  // Keyword analysis
  const allKeywords = extractKeywords(rawVideos.map(v => `${v.title} ${v.description}`));

  // Top performing: keywords from top 25% videos by views
  const topVideos = [...rawVideos].sort((a, b) => b.viewCount - a.viewCount).slice(0, Math.ceil(rawVideos.length * 0.25));
  const topKeywordSet = new Set(extractKeywords(topVideos.map(v => `${v.title} ${v.description}`)).slice(0, 20));

  // Bottom 25% videos
  const bottomVideos = [...rawVideos].sort((a, b) => a.viewCount - b.viewCount).slice(0, Math.ceil(rawVideos.length * 0.25));
  const bottomKeywordSet = new Set(extractKeywords(bottomVideos.map(v => `${v.title} ${v.description}`)).slice(0, 20));

  const topPerforming = allKeywords
    .filter(k => topKeywordSet.has(k))
    .slice(0, 10)
    .map(keyword => {
      const associated = rawVideos.filter(v => `${v.title} ${v.description}`.toLowerCase().includes(keyword));
      const assocViews = associated.reduce((s, v) => s + v.viewCount, 0);
      const assocER = associated.length
        ? parseFloat((associated.reduce((s, v) => s + engagementRate(v.likeCount, v.commentCount, v.viewCount), 0) / associated.length).toFixed(4))
        : 0;
      return { keyword, associatedViews: assocViews, engagementRate: assocER };
    });

  const recommended = allKeywords.filter(k => topKeywordSet.has(k) && !bottomKeywordSet.has(k)).slice(0, 10);
  const toReconsider = allKeywords.filter(k => bottomKeywordSet.has(k) && !topKeywordSet.has(k)).slice(0, 10);

  return {
    platform,
    username: displayName,
    followerCount,
    profilePictureUrl,
    summary: { avgEngagementRate, avgViralityScore, totalViewsAnalyzed: totalViews },
    keywords: { topPerforming, recommended, toReconsider },
    hashtags: extractHashtags(rawVideos),
    videos,
  };
}
