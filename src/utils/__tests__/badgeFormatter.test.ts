/**
 * Unit tests for badgeFormatter utility functions
 */

import { EmbedBuilder } from 'discord.js';
import { BadgeType } from '@prisma/client';
import {
  getBadgeName,
  getBadgeDescription,
  formatPlayerBadgesForEmbed,
  formatPlayerBadgesDetailed,
} from '../badgeFormatter';

// Mock dependencies
jest.mock('../localization', () => ({
  t: jest.fn(),
}));

jest.mock('../badgeManager', () => ({
  getBadges: jest.fn(),
  getBadgeEmoji: jest.fn(),
}));

import { t } from '../localization';
import { getBadges, getBadgeEmoji } from '../badgeManager';

const mockT = t as jest.Mock;
const mockGetBadges = getBadges as jest.Mock;
const mockGetBadgeEmoji = getBadgeEmoji as jest.Mock;

describe('badgeFormatter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBadgeName', () => {
    it('should return localized name for PERFECT_ATTENDANCE', () => {
      mockT.mockReturnValue('Perfect Attendance');

      const result = getBadgeName(BadgeType.PERFECT_ATTENDANCE, 'en');

      expect(mockT).toHaveBeenCalledWith('en', 'badgePerfectAttendance');
      expect(result).toBe('Perfect Attendance');
    });

    it('should return localized name for TANK_MAIN', () => {
      mockT.mockReturnValue('Tank Main');

      const result = getBadgeName(BadgeType.TANK_MAIN, 'en');

      expect(mockT).toHaveBeenCalledWith('en', 'badgeTankMain');
      expect(result).toBe('Tank Main');
    });

    // Add more for other badge types if needed, but one or two sufficient for coverage
  });

  describe('getBadgeDescription', () => {
    it('should return localized description for PERFECT_ATTENDANCE', () => {
      mockT.mockReturnValue('Awarded for perfect attendance');

      const result = getBadgeDescription(BadgeType.PERFECT_ATTENDANCE, 'en');

      expect(mockT).toHaveBeenCalledWith('en', 'badgeDescPerfectAttendance');
      expect(result).toBe('Awarded for perfect attendance');
    });

    it('should return localized description for TANK_MAIN', () => {
      mockT.mockReturnValue('Main tank role');

      const result = getBadgeDescription(BadgeType.TANK_MAIN, 'en');

      expect(mockT).toHaveBeenCalledWith('en', 'badgeDescTankMain');
      expect(result).toBe('Main tank role');
    });
  });

  describe('formatPlayerBadgesForEmbed', () => {
    it('should return empty string when no badges', async () => {
      mockGetBadges.mockResolvedValue([]);

      const result = await formatPlayerBadgesForEmbed('user-1', 'guild-1', 'en');

      expect(mockGetBadges).toHaveBeenCalledWith('user-1', 'guild-1');
      expect(result).toBe('');
    });

    it('should return emoji string for badges up to max', async () => {
      mockGetBadges.mockResolvedValue([
        { badgeType: BadgeType.PERFECT_ATTENDANCE },
        { badgeType: BadgeType.TANK_MAIN },
      ]);
      mockGetBadgeEmoji.mockImplementation((type) => {
        if (type === BadgeType.PERFECT_ATTENDANCE) return '🏆';
        if (type === BadgeType.TANK_MAIN) return '🛡️';
        return '';
      });

      const result = await formatPlayerBadgesForEmbed('user-1', 'guild-1', 'en', 2);

      expect(result).toBe('🏆🛡️');
    });

    it('should append + when more badges than max', async () => {
      mockGetBadges.mockResolvedValue([
        { badgeType: BadgeType.PERFECT_ATTENDANCE },
        { badgeType: BadgeType.TANK_MAIN },
        { badgeType: BadgeType.HEALER_HERO },
      ]);
      mockGetBadgeEmoji.mockReturnValue('🏆');

      const result = await formatPlayerBadgesForEmbed('user-1', 'guild-1', 'en', 2);

      expect(result).toBe('🏆🏆+');
    });
  });

  describe('formatPlayerBadgesDetailed', () => {
    it('should return embed with no badges message', async () => {
      mockGetBadges.mockResolvedValue([]);
      mockT.mockImplementation((lang, key, params) => {
        if (key === 'badgesTitle') return `Badges for ${params.player}`;
        if (key === 'badgesNoBadges') return 'No badges earned yet.';
        return '';
      });

      const result = await formatPlayerBadgesDetailed('user-1', 'guild-1', 'en', 'Player1');

      expect(result).toBeInstanceOf(EmbedBuilder);
      expect(result.data.title).toBe('Badges for Player1');
      expect(result.data.description).toBe('No badges earned yet.');
      expect(result.data.fields).toBeUndefined();
    });

    it('should return embed with badge fields', async () => {
      const earnedAt = new Date();
      mockGetBadges.mockResolvedValue([
        {
          badgeType: BadgeType.PERFECT_ATTENDANCE,
          earnedAt,
          awardedBy: 'awarder-1',
          reason: 'Great attendance',
        },
      ]);
      mockGetBadgeEmoji.mockReturnValue('🏆');
      mockT.mockImplementation((lang, key, params) => {
        if (key === 'badgesTitle') return `Badges for ${params.player}`;
        if (key === 'badgePerfectAttendance') return 'Perfect Attendance';
        if (key === 'badgeDescPerfectAttendance') return 'Perfect attendance achieved';
        if (key === 'badgesEarnedOn') return 'Earned on';
        if (key === 'badgesAwardedBy') return 'Awarded by';
        if (key === 'badgesReason') return 'Reason';
        return '';
      });

      const result = await formatPlayerBadgesDetailed('user-1', 'guild-1', 'en', 'Player1');

      expect(result).toBeInstanceOf(EmbedBuilder);
      expect(result.data.title).toBe('Badges for Player1');
      expect(result.data.fields).toHaveLength(1);
      expect(result.data.fields![0].name).toBe('🏆 Perfect Attendance');
      expect(result.data.fields![0].value).toContain('Perfect attendance achieved');
      expect(result.data.fields![0].value).toContain('Earned on:');
      expect(result.data.fields![0].value).toContain('Awarded by: <@awarder-1>');
      expect(result.data.fields![0].value).toContain('Reason: Great attendance');
    });
  });
});