/**
 * Unit tests for feedbackFormatter utility functions
 */

import { EmbedBuilder } from 'discord.js';
import {
  formatRaidFeedbackEmbed,
  formatGuildMoraleEmbed,
} from '../feedbackFormatter';
import type { RaidFeedbackSummary, GuildMorale } from '../feedbackAnalyzer';

// Mock dependencies
jest.mock('../localization', () => ({
  t: jest.fn(),
  getTranslations: jest.fn(),
}));

import { t, getTranslations } from '../localization';

const mockT = t as jest.Mock;
const mockGetTranslations = getTranslations as jest.Mock;

describe('feedbackFormatter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatRaidFeedbackEmbed', () => {
    it('should format embed for high quality score', () => {
      const summary: RaidFeedbackSummary = {
        qualityScore: 85,
        moodCounts: { great: 5, okay: 2, frustrating: 1 },
        totalFeedback: 8,
        averageSentiment: 0.85,
        commonWords: ['fun', 'smooth', 'organized'],
      };
      const raidDate = new Date('2025-12-25');
      mockT.mockImplementation((lang, key, params) => {
        if (key === 'raidFeedbackSummary') return `Feedback for ${params.raid}`;
        if (key === 'feedbackBreakdown') return 'Mood Breakdown';
        if (key === 'commonWords') return 'Common Words';
        if (key === 'date') return 'Date';
        return '';
      });
      mockGetTranslations.mockReturnValue({
        moodScore: 'Mood Score',
        date: 'Date',
        feedbackGreat: 'Great',
        feedbackOkay: 'Okay',
        feedbackFrustrating: 'Frustrating',
      });

      const result = formatRaidFeedbackEmbed('Test Raid', raidDate, summary, 'en');

      expect(result).toBeInstanceOf(EmbedBuilder);
      expect(result.data.title).toBe('Feedback for Test Raid');
      expect(result.data.color).toBe(0x00ae86); // green
      expect(result.data.description).toContain('**Mood Score:** 85/100');
      expect(result.data.fields).toHaveLength(2); // breakdown and common words
      expect(result.data.footer!.text).toContain('Date: 2025-12-25');
    });

    it('should format embed for medium quality score', () => {
      const summary: RaidFeedbackSummary = {
        qualityScore: 60,
        moodCounts: { great: 2, okay: 3, frustrating: 2 },
        totalFeedback: 7,
        averageSentiment: 0.6,
        commonWords: [],
      };
      const raidDate = new Date('2025-12-25');
      mockT.mockReturnValue('Feedback');
      mockGetTranslations.mockReturnValue({
        moodScore: 'Mood Score',
        date: 'Date',
        feedbackGreat: 'Great',
        feedbackOkay: 'Okay',
        feedbackFrustrating: 'Frustrating',
        noFeedback: 'No feedback',
      });

      const result = formatRaidFeedbackEmbed('Test Raid', raidDate, summary, 'en');

      expect(result.data.color).toBe(0xffd700); // yellow
      expect(result.data.fields).toHaveLength(1); // only breakdown, no common words
    });

    it('should format embed for low quality score', () => {
      const summary: RaidFeedbackSummary = {
        qualityScore: 30,
        moodCounts: { great: 0, okay: 1, frustrating: 5 },
        totalFeedback: 6,
        averageSentiment: 0.3,
        commonWords: ['hard', 'wipe'],
      };

      const result = formatRaidFeedbackEmbed('Test Raid', new Date(), summary, 'en');

      expect(result.data.color).toBe(0xff4500); // red
    });
  });

  describe('formatGuildMoraleEmbed', () => {
    it('should format embed for high morale', () => {
      const morale: GuildMorale = {
        averageSentiment: 0.85,
        trend: 'improving',
        bestRaids: [
          { raidId: 'raid-1', description: 'Great Raid', raidDate: new Date('2025-12-25'), sentiment: 0.9 },
        ],
        worstRaids: [
          { raidId: 'raid-2', description: 'Bad Raid', raidDate: new Date('2025-12-24'), sentiment: 0.4 },
        ],
        roleMorale: [
          { role: 'Tank', averageSentiment: 0.8, feedbackCount: 5 },
        ],
      };
      mockT.mockImplementation((lang, key, params) => {
        if (key === 'guildMorale') return `Morale for ${params.guild}`;
        if (key === 'overallSentiment') return 'Overall Sentiment';
        if (key === 'trend') return 'Trend';
        if (key === 'trendImproving') return 'Improving';
        if (key === 'bestRaids') return 'Best Raids';
        if (key === 'worstRaids') return 'Worst Raids';
        if (key === 'roleMorale') return 'Role Morale';
        if (key === 'lastDays') return `Last ${params.days} days`;
        if (key === 'tank') return 'Tank';
        return '';
      });
      mockGetTranslations.mockReturnValue({
        overallSentiment: 'Overall Sentiment',
        trend: 'Trend',
      });

      const result = formatGuildMoraleEmbed('Test Guild', morale, 30, 'en');

      expect(result).toBeInstanceOf(EmbedBuilder);
      expect(result.data.title).toBe('Morale for Test Guild');
      expect(result.data.color).toBe(0x00ae86); // green
      expect(result.data.description).toContain('**Overall Sentiment:** 85.0%');
      expect(result.data.description).toContain('**Trend:** 📈 Improving');
      expect(result.data.fields).toHaveLength(3); // best, worst, role
      expect(result.data.footer!.text).toBe('Last 30 days');
    });

    it('should format embed with no raids or roles', () => {
      const morale: GuildMorale = {
        averageSentiment: 0.5,
        trend: 'stable',
        bestRaids: [],
        worstRaids: [],
        roleMorale: [],
      };

      const result = formatGuildMoraleEmbed('Test Guild', morale, 7, 'en');

      expect(result.data.color).toBe(0xffd700); // yellow
      expect(result.data.fields).toBeUndefined();
    });
  });
});