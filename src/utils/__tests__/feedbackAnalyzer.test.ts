jest.mock('../../database/client', () => {
  return {
    __esModule: true,
    default: {
      raidFeedback: {
        findMany: jest.fn(),
      },
      raidAttendance: {
        findMany: jest.fn(),
      },
      raid: {
        findMany: jest.fn(),
      },
    },
  };
});

import prisma from '../../database/client';
import { analyzeRaidFeedback, getGuildMorale } from '../feedbackAnalyzer';

const mockedPrisma = prisma as unknown as {
  raidFeedback: {
    findMany: jest.Mock;
  };
  raidAttendance: {
    findMany: jest.Mock;
  };
  raid: {
    findMany: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Helper Factories ---

function makeRaidFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: 'feedback-1',
    raidId: 'raid-1',
    userId: 'user-1',
    mood: 'GREAT' as const,
    comment: null as string | null,
    createdAt: new Date('2026-01-20T20:00:00Z'),
    ...overrides,
  };
}

function makeRaid(overrides: Record<string, unknown> = {}) {
  return {
    id: 'raid-1',
    guildId: 'guild-1',
    description: 'Test Raid',
    raidDate: new Date('2026-01-20T19:00:00Z'),
    ...overrides,
  };
}

function makeRaidAttendance(overrides: Record<string, unknown> = {}) {
  return {
    raidId: 'raid-1',
    userId: 'user-1',
    wowClass: 'Warrior',
    wowSpec: 'Protection',
    status: 'attending',
    ...overrides,
  };
}

// --- analyzeRaidFeedback ---

describe('analyzeRaidFeedback()', () => {
  it('should return zero values when no feedback exists', async () => {
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await analyzeRaidFeedback('raid-1');

    expect(result.totalFeedback).toBe(0);
    expect(result.moodCounts.great).toBe(0);
    expect(result.moodCounts.okay).toBe(0);
    expect(result.moodCounts.frustrating).toBe(0);
    expect(result.averageSentiment).toBe(0);
    expect(result.qualityScore).toBe(0);
    expect(result.commonWords).toEqual([]);
  });

  it('should correctly count moods and calculate sentiment', async () => {
    const feedbacks = [
      makeRaidFeedback({ mood: 'GREAT' }),
      makeRaidFeedback({ mood: 'GREAT', id: 'feedback-2' }),
      makeRaidFeedback({ mood: 'OKAY', id: 'feedback-3' }),
      makeRaidFeedback({ mood: 'FRUSTRATING', id: 'feedback-4' }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);

    const result = await analyzeRaidFeedback('raid-1');

    expect(result.totalFeedback).toBe(4);
    expect(result.moodCounts.great).toBe(2);
    expect(result.moodCounts.okay).toBe(1);
    expect(result.moodCounts.frustrating).toBe(1);
    expect(result.averageSentiment).toBe(0.625); // (1+1+0.5+0)/4 = 2.5/4
    expect(result.qualityScore).toBe(63); // 62.5 rounded
  });

  it('should extract common words from comments', async () => {
    const feedbacks = [
      makeRaidFeedback({ comment: 'This raid was great and fun!' }),
      makeRaidFeedback({ comment: 'Great raid, had fun with the team', id: 'feedback-2' }),
      makeRaidFeedback({ comment: 'Fun time overall', id: 'feedback-3' }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);

    const result = await analyzeRaidFeedback('raid-1');

    // Top 5 words: fun(3), raid(2), great(2), this(1), was(1)
    expect(result.commonWords).toEqual(['fun', 'raid', 'great', 'this', 'was']);
  });

  it('should filter out short words and punctuation', async () => {
    const feedbacks = [
      makeRaidFeedback({ comment: 'a an the and or but!' }),
      makeRaidFeedback({ comment: 'raid was great.', id: 'feedback-2' }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);

    const result = await analyzeRaidFeedback('raid-1');

    // Words: the(1), and(1), but(1), raid(1), was(1), great(1)
    expect(result.commonWords).toEqual(['the', 'and', 'but', 'raid', 'was']);
  });

  it('should handle mixed case and normalize to lowercase', async () => {
    const feedbacks = [
      makeRaidFeedback({ comment: 'GREAT RAID' }),
      makeRaidFeedback({ comment: 'great experience', id: 'feedback-2' }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);

    const result = await analyzeRaidFeedback('raid-1');

    expect(result.commonWords).toEqual(['great', 'raid', 'experience']);
  });
});

// --- getGuildMorale ---

describe('getGuildMorale()', () => {
  it('should return zero values when no feedback exists', async () => {
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1');

    expect(result.averageSentiment).toBe(0);
    expect(result.trend).toBe('stable');
    expect(result.bestRaids).toEqual([]);
    expect(result.worstRaids).toEqual([]);
    expect(result.roleMorale).toEqual([]);
  });

  it('should calculate overall average sentiment', async () => {
    const feedbacks = [
      makeRaidFeedback({ mood: 'GREAT', raidId: 'raid-1', raid: makeRaid() }),
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-2', id: 'feedback-2', raid: makeRaid({ id: 'raid-2' }) }),
      makeRaidFeedback({ mood: 'FRUSTRATING', raidId: 'raid-3', id: 'feedback-3', raid: makeRaid({ id: 'raid-3' }) }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1');

    expect(result.averageSentiment).toBe(0.5); // (1 + 0.5 + 0) / 3
  });

  it('should detect improving trend', async () => {
    const feedbacks = [
      // First half (older): average 0.25
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-1', createdAt: new Date('2026-01-01T20:00:00Z'), raid: makeRaid({ raidDate: new Date('2026-01-01T19:00:00Z') }) }),
      makeRaidFeedback({ mood: 'FRUSTRATING', raidId: 'raid-2', createdAt: new Date('2026-01-02T20:00:00Z'), id: 'feedback-2', raid: makeRaid({ id: 'raid-2', raidDate: new Date('2026-01-02T19:00:00Z') }) }),
      // Second half (newer): average 0.75
      makeRaidFeedback({ mood: 'GREAT', raidId: 'raid-3', createdAt: new Date('2026-01-27T20:00:00Z'), id: 'feedback-3', raid: makeRaid({ id: 'raid-3', raidDate: new Date('2026-01-27T19:00:00Z') }) }),
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-4', createdAt: new Date('2026-01-28T20:00:00Z'), id: 'feedback-4', raid: makeRaid({ id: 'raid-4', raidDate: new Date('2026-01-28T19:00:00Z') }) }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1', 30);

    expect(result.trend).toBe('improving');
  });

  it('should detect declining trend', async () => {
    const feedbacks = [
      // First half: average 0.75
      makeRaidFeedback({ mood: 'GREAT', raidId: 'raid-1', createdAt: new Date('2026-01-01T20:00:00Z'), raid: makeRaid({ raidDate: new Date('2026-01-01T19:00:00Z') }) }),
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-2', createdAt: new Date('2026-01-02T20:00:00Z'), id: 'feedback-2', raid: makeRaid({ id: 'raid-2', raidDate: new Date('2026-01-02T19:00:00Z') }) }),
      // Second half: average 0.25
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-3', createdAt: new Date('2026-01-16T20:00:00Z'), id: 'feedback-3', raid: makeRaid({ id: 'raid-3', raidDate: new Date('2026-01-16T19:00:00Z') }) }),
      makeRaidFeedback({ mood: 'FRUSTRATING', raidId: 'raid-4', createdAt: new Date('2026-01-17T20:00:00Z'), id: 'feedback-4', raid: makeRaid({ id: 'raid-4', raidDate: new Date('2026-01-17T19:00:00Z') }) }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1', 30);

    expect(result.trend).toBe('declining');
  });

  it('should return stable trend when difference is minimal', async () => {
    const feedbacks = [
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-1', createdAt: new Date('2026-01-01T20:00:00Z'), raid: makeRaid({ raidDate: new Date('2026-01-01T19:00:00Z') }) }),
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-2', createdAt: new Date('2026-01-27T20:00:00Z'), id: 'feedback-2', raid: makeRaid({ id: 'raid-2', raidDate: new Date('2026-01-27T19:00:00Z') }) }),
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1', 30);

    expect(result.trend).toBe('stable');
  });

  it('should identify best and worst raids', async () => {
    const raid1 = makeRaid({ id: 'raid-1', description: 'Raid 1' });
    const raid2 = makeRaid({ id: 'raid-2', description: 'Raid 2', raidDate: new Date('2026-01-19T19:00:00Z') });
    const raid3 = makeRaid({ id: 'raid-3', description: 'Raid 3', raidDate: new Date('2026-01-18T19:00:00Z') });

    const feedbacks = [
      makeRaidFeedback({ mood: 'GREAT', raidId: 'raid-1', raid: raid1 }),
      makeRaidFeedback({ mood: 'FRUSTRATING', raidId: 'raid-2', id: 'feedback-2', raid: raid2 }),
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-3', id: 'feedback-3', raid: raid3 }),
    ];

    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1');

    expect(result.bestRaids).toHaveLength(3);
    expect(result.bestRaids[0].raidId).toBe('raid-1');
    expect(result.bestRaids[0].sentiment).toBe(1.0);
    expect(result.bestRaids[1].raidId).toBe('raid-3');
    expect(result.bestRaids[1].sentiment).toBe(0.5);

    expect(result.worstRaids).toHaveLength(3);
    expect(result.worstRaids[0].raidId).toBe('raid-2');
    expect(result.worstRaids[0].sentiment).toBe(0.0);
    expect(result.worstRaids[1].raidId).toBe('raid-3');
    expect(result.worstRaids[1].sentiment).toBe(0.5);
  });

  it('should calculate role-specific morale', async () => {
    const feedbacks = [
      makeRaidFeedback({ mood: 'GREAT', raidId: 'raid-1', userId: 'tank-user' }),
      makeRaidFeedback({ mood: 'OKAY', raidId: 'raid-1', userId: 'healer-user', id: 'feedback-2' }),
      makeRaidFeedback({ mood: 'FRUSTRATING', raidId: 'raid-2', userId: 'dps-user', id: 'feedback-3' }),
    ];

    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks.map(f => ({
      ...f,
      raid: makeRaid({ id: f.raidId }),
    })));

    const attendances = [
      makeRaidAttendance({ raidId: 'raid-1', userId: 'tank-user', wowClass: 'Warrior', wowSpec: 'Protection' }),
      makeRaidAttendance({ raidId: 'raid-1', userId: 'healer-user', wowClass: 'Priest', wowSpec: 'Holy' }),
      makeRaidAttendance({ raidId: 'raid-2', userId: 'dps-user', wowClass: 'Mage', wowSpec: 'Fire' }),
    ];

    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(attendances);

    const result = await getGuildMorale('guild-1');

    expect(result.roleMorale).toHaveLength(3);

    const tankMorale = result.roleMorale.find(r => r.role === 'Tank');
    expect(tankMorale?.averageSentiment).toBe(1.0);
    expect(tankMorale?.feedbackCount).toBe(1);

    const healerMorale = result.roleMorale.find(r => r.role === 'Healer');
    expect(healerMorale?.averageSentiment).toBe(0.5);
    expect(healerMorale?.feedbackCount).toBe(1);

    const dpsMorale = result.roleMorale.find(r => r.role === 'Ranged');
    expect(dpsMorale?.averageSentiment).toBe(0.0);
    expect(dpsMorale?.feedbackCount).toBe(1);
  });

  it('should respect days parameter for time filtering', async () => {
    const feedbacks = [
      makeRaidFeedback({ createdAt: new Date('2026-01-01T20:00:00Z'), raid: makeRaid({ raidDate: new Date('2026-01-01T19:00:00Z') }) }), // Outside 7 days
      makeRaidFeedback({ createdAt: new Date('2026-01-18T20:00:00Z'), id: 'feedback-2', raid: makeRaid({ raidDate: new Date('2026-01-18T19:00:00Z') }) }), // Within 7 days
    ];
    (mockedPrisma.raidFeedback.findMany as jest.Mock).mockResolvedValue(feedbacks);
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getGuildMorale('guild-1', 7);

    // Should only include the second feedback
    expect(result.averageSentiment).toBe(1.0);
  });
});