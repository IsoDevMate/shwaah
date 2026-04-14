import { Database } from '../models';

interface PlatformHealth {
  platform: string;
  score: number; // 0-100
  issues: string[];
  tips: string[];
}

interface HealthReport {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  platforms: PlatformHealth[];
  summary: string;
}

// Scoring weights
const W = {
  connected: 15,       // account is connected
  recentPost: 25,      // posted in last 7 days
  consistency: 25,     // posted at least 2x in last 30 days
  engagement: 20,      // has engagement data
  variety: 10,         // uses media (not text-only)
  bio: 5,              // bio exists and has a CTA
};

export async function buildHealthReport(userId: string, liveMetrics: Record<string, any>): Promise<HealthReport> {
  const platforms = Object.keys(liveMetrics).filter(p => !liveMetrics[p]?.error);

  if (!platforms.length) {
    return {
      overallScore: 0,
      grade: 'F',
      platforms: [],
      summary: 'No connected platforms. Connect at least one social account to get your health score.',
    };
  }

  // Fetch posting data per platform
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const recentPosts = await Database.execute(
    `SELECT platforms, mediaUrls, createdAt FROM Posts
     WHERE userId = ? AND status IN ('published','posted') AND createdAt >= ?`,
    [userId, thirtyDaysAgo]
  );

  // Build per-platform post counts
  const postCount30: Record<string, number> = {};
  const postCount7: Record<string, number> = {};
  const hasMedia: Record<string, boolean> = {};

  for (const row of recentPosts.rows) {
    const rowPlatforms: string[] = JSON.parse(String(row.platforms || '[]'));
    const media: string[] = JSON.parse(String(row.mediaUrls || '[]'));
    const createdAt = String(row.createdAt);

    for (const p of rowPlatforms) {
      postCount30[p] = (postCount30[p] || 0) + 1;
      if (createdAt >= sevenDaysAgo) postCount7[p] = (postCount7[p] || 0) + 1;
      if (media.length > 0) hasMedia[p] = true;
    }
  }

  // Fetch avg engagement per platform
  const engagementRows = await Database.execute(
    `SELECT a.platform, AVG(a.engagementRate) as avgER
     FROM Analytics a JOIN Posts p ON a.postId = p.id
     WHERE p.userId = ? AND a.engagementRate > 0
     GROUP BY a.platform`,
    [userId]
  );
  const avgEngagement: Record<string, number> = {};
  for (const row of engagementRows.rows) {
    avgEngagement[String(row.platform)] = Number(row.avgER);
  }

  const platformReports: PlatformHealth[] = [];

  for (const platform of platforms) {
    const issues: string[] = [];
    const tips: string[] = [];
    let score = 0;

    // Connected
    score += W.connected;

    // Recent post (last 7 days)
    if ((postCount7[platform] || 0) >= 1) {
      score += W.recentPost;
    } else {
      const daysSince = postCount30[platform]
        ? `You haven't posted on ${platform} in over 7 days.`
        : `You haven't posted on ${platform} in over 30 days.`;
      issues.push(daysSince);
      tips.push(`Post at least once this week on ${platform} to stay active.`);
    }

    // Consistency (2+ posts in 30 days)
    const count30 = postCount30[platform] || 0;
    if (count30 >= 2) {
      score += W.consistency;
    } else if (count30 === 1) {
      score += Math.round(W.consistency * 0.5);
      issues.push(`Only 1 post on ${platform} in the last 30 days.`);
      tips.push(`Aim for at least 2 posts per week on ${platform} for consistent growth.`);
    } else {
      issues.push(`No posts on ${platform} in the last 30 days.`);
      tips.push(`Start posting on ${platform} — even 1 post a week makes a difference.`);
    }

    // Engagement data
    if (avgEngagement[platform]) {
      score += W.engagement;
      const er = (avgEngagement[platform] * 100).toFixed(1);
      if (avgEngagement[platform] < 0.02) {
        issues.push(`Low engagement rate on ${platform} (${er}%).`);
        tips.push(`Try adding a question or CTA at the end of your ${platform} posts to boost engagement.`);
      }
    } else {
      issues.push(`No engagement data yet for ${platform}.`);
      tips.push(`Publish more posts on ${platform} to start tracking engagement.`);
    }

    // Media variety
    if (hasMedia[platform]) {
      score += W.variety;
    } else {
      issues.push(`No media (images/video) detected in recent ${platform} posts.`);
      tips.push(`Posts with visuals get significantly more reach on ${platform}. Add images or video.`);
    }

    // Platform-specific checks
    const m = liveMetrics[platform];
    if (platform === 'instagram' && m?.followers === 0) {
      issues.push('Your Instagram account has 0 followers — make sure your account is public.');
    }
    if (platform === 'linkedin' && !m?.username) {
      issues.push('LinkedIn profile name is missing — check your account connection.');
    }

    // Bio analysis
    if (m?.bioUnavailable) {
      // Can't check — skip silently, no penalty
    } else if (m?.bio) {
      const hasCTA = /link|bio|shop|dm|comment|follow|subscribe|click|join|sign|get|download|watch|check|visit|book|order|buy/i.test(m.bio);
      if (hasCTA) {
        score += W.bio;
      } else {
        issues.push(`Your ${platform} bio has no call-to-action.`);
        tips.push(`Add a CTA to your ${platform} bio — e.g. "DM for collabs" or a link to your work.`);
      }
    } else {
      issues.push(`Your ${platform} bio is empty.`);
      tips.push(`Add a bio to your ${platform} profile — it's the first thing new visitors read.`);
    }

    platformReports.push({ platform, score: Math.min(100, score), issues, tips });
  }

  const overallScore = Math.round(
    platformReports.reduce((s, p) => s + p.score, 0) / platformReports.length
  );

  return {
    overallScore,
    grade: scoreToGrade(overallScore),
    platforms: platformReports,
    summary: buildSummary(overallScore, platformReports),
  };
}

function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function buildSummary(score: number, platforms: PlatformHealth[]): string {
  const worst = [...platforms].sort((a, b) => a.score - b.score)[0];
  if (score >= 85) return 'Your creator profile is in great shape. Keep the consistency going.';
  if (score >= 70) return `Good overall. Focus on ${worst?.platform} — it's dragging your score down.`;
  if (score >= 55) return `Room to improve. Your biggest gap is on ${worst?.platform}.`;
  return `Your profile needs attention. Start by posting consistently on ${worst?.platform}.`;
}
