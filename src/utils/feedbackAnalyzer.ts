import prisma from '../database/client';
import { getSpecRole, WoWRole } from './wowData';

/**
 * Single raid feedback summary.
 */
export interface RaidFeedbackSummary {
  totalFeedback: number;
  moodCounts: {
    great: number;
    okay: number;
    frustrating: number;
  };
  averageSentiment: number; // 0-1 scale
  qualityScore: number; // 0-100, same as averageSentiment * 100
  commonWords: string[]; // top 5 words from comments (optional)
}

/**
 * Trend indicator for morale.
 */
export type MoraleTrend = 'improving' | 'stable' | 'declining';

/**
 * Guild-wide morale analysis.
 */
export interface GuildMorale {
  averageSentiment: number; // 0-1 scale
  trend: MoraleTrend;
  bestRaids: Array<{
    raidId: string;
    description: string | null;
    raidDate: Date;
    sentiment: number;
  }>;
  worstRaids: Array<{
    raidId: string;
    description: string | null;
    raidDate: Date;
    sentiment: number;
  }>;
  roleMorale: Array<{
    role: WoWRole;
    averageSentiment: number;
    feedbackCount: number;
  }>;
}

/**
 * Convert mood string to sentiment value (0-1).
 */
function moodToSentiment(mood: string): number {
  switch (mood) {
    case 'GREAT':
      return 1.0;
    case 'OKAY':
      return 0.5;
    case 'FRUSTRATING':
      return 0.0;
    default:
      return 0.5;
  }
}

/**
 * Analyze feedback for a single raid.
 *
 * @param raidId - The raid ID to analyze
 * @returns Feedback summary with counts, sentiment, and quality score
 */
export async function analyzeRaidFeedback(raidId: string): Promise<RaidFeedbackSummary> {
  const feedbacks = await prisma.raidFeedback.findMany({
    where: { raidId },
    select: {
      mood: true,
      comment: true,
    },
  });

  const totalFeedback = feedbacks.length;

  if (totalFeedback === 0) {
    return {
      totalFeedback: 0,
      moodCounts: { great: 0, okay: 0, frustrating: 0 },
      averageSentiment: 0,
      qualityScore: 0,
      commonWords: [],
    };
  }

  const moodCounts = { great: 0, okay: 0, frustrating: 0 };
  let totalSentiment = 0;

  for (const feedback of feedbacks) {
    const sentiment = moodToSentiment(feedback.mood);
    totalSentiment += sentiment;

    switch (feedback.mood) {
      case 'GREAT':
        moodCounts.great++;
        break;
      case 'OKAY':
        moodCounts.okay++;
        break;
      case 'FRUSTRATING':
        moodCounts.frustrating++;
        break;
    }
  }

  const averageSentiment = totalSentiment / totalFeedback;
  const qualityScore = Math.round(averageSentiment * 100);

  // Simple word cloud: split comments, count words, top 5
  const wordCounts = new Map<string, number>();
  for (const feedback of feedbacks) {
    if (feedback.comment) {
      const words = feedback.comment.toLowerCase().split(/\s+/);
      for (const word of words) {
        // Basic filtering: remove punctuation, skip short words
        const cleanWord = word.replace(/[^\w]/g, '');
        if (cleanWord.length > 2) {
          wordCounts.set(cleanWord, (wordCounts.get(cleanWord) || 0) + 1);
        }
      }
    }
  }

  const commonWords = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return {
    totalFeedback,
    moodCounts,
    averageSentiment,
    qualityScore,
    commonWords,
  };
}

/**
 * Get guild-wide morale trends and analysis.
 *
 * @param guildId - Guild ID
 * @param days - Number of days to analyze (default 30)
 * @returns Guild morale analysis
 */
export async function getGuildMorale(guildId: string, days: number = 30): Promise<GuildMorale> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Get all feedback for the period
  const feedbacks = await prisma.raidFeedback.findMany({
    where: {
      raid: {
        guildId,
        raidDate: { gte: cutoff },
      },
    },
    include: {
      raid: {
        select: {
          id: true,
          description: true,
          raidDate: true,
        },
      },
    },
  });

  if (feedbacks.length === 0) {
    return {
      averageSentiment: 0,
      trend: 'stable',
      bestRaids: [],
      worstRaids: [],
      roleMorale: [],
    };
  }

  // Calculate overall average sentiment
  const totalSentiment = feedbacks.reduce((sum, f) => sum + moodToSentiment(f.mood), 0);
  const averageSentiment = totalSentiment / feedbacks.length;

  // Calculate trend: compare first half vs second half
  const midPoint = new Date(cutoff.getTime() + (days / 2) * 24 * 60 * 60 * 1000);
  const firstHalf = feedbacks.filter(f => f.raid.raidDate < midPoint);
  const secondHalf = feedbacks.filter(f => f.raid.raidDate >= midPoint);

  const firstHalfAvg = firstHalf.length > 0
    ? firstHalf.reduce((sum, f) => sum + moodToSentiment(f.mood), 0) / firstHalf.length
    : 0;
  const secondHalfAvg = secondHalf.length > 0
    ? secondHalf.reduce((sum, f) => sum + moodToSentiment(f.mood), 0) / secondHalf.length
    : 0;

  const trendDiff = secondHalfAvg - firstHalfAvg;
  const trend: MoraleTrend = trendDiff > 0.1 ? 'improving' : trendDiff < -0.1 ? 'declining' : 'stable';

  // Best and worst raids
  const raidSentiments = new Map<string, { sentiment: number; raid: any; count: number }>();
  for (const feedback of feedbacks) {
    const raidId = feedback.raid.id;
    const sentiment = moodToSentiment(feedback.mood);
    const existing = raidSentiments.get(raidId);
    if (existing) {
      existing.sentiment = (existing.sentiment * existing.count + sentiment) / (existing.count + 1);
      existing.count++;
    } else {
      raidSentiments.set(raidId, {
        sentiment,
        raid: feedback.raid,
        count: 1,
      });
    }
  }

  const sortedRaids = Array.from(raidSentiments.entries())
    .map(([raidId, data]) => ({
      raidId,
      description: data.raid.description,
      raidDate: data.raid.raidDate,
      sentiment: data.sentiment,
    }))
    .sort((a, b) => b.sentiment - a.sentiment);

  const bestRaids = sortedRaids.slice(0, 3);
  const worstRaids = sortedRaids.slice(-3).reverse();

  // Role morale: get attendances for the raids
  const raidIds = Array.from(raidSentiments.keys());
  const attendances = await prisma.raidAttendance.findMany({
    where: {
      raidId: { in: raidIds },
      status: { in: ['attending', 'late'] },
    },
    select: {
      raidId: true,
      userId: true,
      wowClass: true,
      wowSpec: true,
    },
  });

  // Map raid-user to role
  const userRoleMap = new Map<string, WoWRole>();
  for (const att of attendances) {
    if (att.wowClass && att.wowSpec) {
      const role = getSpecRole(att.wowClass, att.wowSpec);
      if (role) {
        userRoleMap.set(`${att.raidId}-${att.userId}`, role);
      }
    }
  }

  // Now calculate role sentiments
  const roleSentiments = new Map<WoWRole, { totalSentiment: number; count: number }>();
  for (const feedback of feedbacks) {
    const role = userRoleMap.get(`${feedback.raidId}-${feedback.userId}`);
    if (role) {
      const sentiment = moodToSentiment(feedback.mood);
      const existing = roleSentiments.get(role);
      if (existing) {
        existing.totalSentiment += sentiment;
        existing.count++;
      } else {
        roleSentiments.set(role, { totalSentiment: sentiment, count: 1 });
      }
    }
  }

  const roleMorale = Array.from(roleSentiments.entries()).map(([role, data]) => ({
    role,
    averageSentiment: data.totalSentiment / data.count,
    feedbackCount: data.count,
  }));

  return {
    averageSentiment,
    trend,
    bestRaids,
    worstRaids,
    roleMorale,
  };
}