jest.mock('../../database/client', () => {
  return {
    __esModule: true,
    default: {
      raidAttendance: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      badge: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      playerBadgeView: {
        upsert: jest.fn(),
      },
    },
  };
});

import prisma from '../../database/client';
import { BadgeType } from '@prisma/client';
import {
  checkAndAwardBadges,
  awardBadge,
  awardManualBadge,
  getBadges,
  getBadgeEmoji,
  checkPerfectAttendance,
  checkTankMain,
  checkHealerHero,
  checkDamageDealer,
  checkSharpshooter,
  checkAlwaysOnTime,
  checkEarlyBird,
  checkTeamPlayer,
  checkReliableMember,
  checkRisingStar,
  checkVeteranRaider,
} from '../badgeManager';

const mockedPrisma = prisma as unknown as {
  raidAttendance: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
  };
  badge: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  playerBadgeView: {
    upsert: jest.Mock;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

// --- Helper Factories ---

function makeAttendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    raidId: 'raid-1',
    userId: 'user-1',
    username: 'TestPlayer',
    status: 'attending',
    wowClass: null as string | null,
    wowSpec: null as string | null,
    respondedAt: null as Date | null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    guildId: 'guild-1',
    optoutReason: null as string | null,
    playerNote: null as string | null,
    notedAt: null as Date | null,
    raid: {
      raidDate: new Date('2026-01-20T19:00:00Z'),
    },
    ...overrides,
  };
}

function makeBadge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'badge-1',
    userId: 'user-1',
    guildId: 'guild-1',
    badgeType: 'VETERAN_RAIDER' as BadgeType,
    earnedAt: new Date('2026-01-20T19:00:00Z'),
    awardedBy: null as string | null,
    reason: null as string | null,
    ...overrides,
  };
}

// --- getBadgeEmoji ---

describe('getBadgeEmoji()', () => {
  it('should return correct emoji for each badge type', () => {
    expect(getBadgeEmoji('PERFECT_ATTENDANCE')).toBe('\u{1F3C6}');
    expect(getBadgeEmoji('TANK_MAIN')).toBe('\u{1F6E1}\uFE0F');
    expect(getBadgeEmoji('HEALER_HERO')).toBe('\u{1F49A}');
    expect(getBadgeEmoji('DAMAGE_DEALER')).toBe('\u2694\uFE0F');
    expect(getBadgeEmoji('SHARPSHOOTER')).toBe('\u{1F3AF}');
    expect(getBadgeEmoji('ALWAYS_ON_TIME')).toBe('\u23F0');
    expect(getBadgeEmoji('EARLY_BIRD')).toBe('\u{1F680}');
    expect(getBadgeEmoji('TEAM_PLAYER')).toBe('\u{1F465}');
    expect(getBadgeEmoji('RELIABLE_MEMBER')).toBe('\u{1F31F}');
    expect(getBadgeEmoji('RISING_STAR')).toBe('\u{1F4C8}');
    expect(getBadgeEmoji('VETERAN_RAIDER')).toBe('\u{1F3AE}');
    expect(getBadgeEmoji('LEADERS_CHOICE')).toBe('\u{1F451}');
  });
});

// --- checkPerfectAttendance ---

describe('checkPerfectAttendance()', () => {
  it('should return true for 10 consecutive attending raids', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        raidId: `raid-${i}`,
        status: 'attending',
        raid: { raidDate: new Date(`2026-01-${20 - i}T19:00:00Z`) },
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkPerfectAttendance('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false for 9 consecutive attending raids', async () => {
    const records = Array.from({ length: 9 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        raidId: `raid-${i}`,
        status: 'attending',
        raid: { raidDate: new Date(`2026-01-${20 - i}T19:00:00Z`) },
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkPerfectAttendance('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return false when streak is broken by opted_out', async () => {
    const records = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeAttendanceRecord({
          id: `att-${i}`,
          raidId: `raid-${i}`,
          status: 'attending',
          raid: { raidDate: new Date(`2026-01-${20 - i}T19:00:00Z`) },
        }),
      ),
      makeAttendanceRecord({
        id: 'att-break',
        raidId: 'raid-break',
        status: 'opted_out',
        raid: { raidDate: new Date('2026-01-14T19:00:00Z') },
      }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeAttendanceRecord({
          id: `att-old-${i}`,
          raidId: `raid-old-${i}`,
          status: 'attending',
          raid: { raidDate: new Date(`2026-01-${13 - i}T19:00:00Z`) },
        }),
      ),
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkPerfectAttendance('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return false for empty records', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await checkPerfectAttendance('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkTankMain ---

describe('checkTankMain()', () => {
  it('should return true when player has 5 raids as Tank', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Warrior',
        wowSpec: 'Protection',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkTankMain('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false when player has only 4 raids as Tank', async () => {
    const records = Array.from({ length: 4 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Warrior',
        wowSpec: 'Protection',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkTankMain('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should not count DPS specs as Tank', async () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Warrior',
        wowSpec: 'Arms',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkTankMain('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkHealerHero ---

describe('checkHealerHero()', () => {
  it('should return true when player has 5 raids as Healer', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Priest',
        wowSpec: 'Holy',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkHealerHero('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false when player has fewer than 5 healer raids', async () => {
    const records = Array.from({ length: 3 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Druid',
        wowSpec: 'Restoration',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkHealerHero('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkDamageDealer ---

describe('checkDamageDealer()', () => {
  it('should return true for 5 melee DPS raids', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Rogue',
        wowSpec: 'Assassination',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkDamageDealer('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should not count ranged DPS as melee', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Mage',
        wowSpec: 'Fire',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkDamageDealer('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkSharpshooter ---

describe('checkSharpshooter()', () => {
  it('should return true for 5 ranged DPS raids', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Mage',
        wowSpec: 'Fire',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkSharpshooter('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should not count melee DPS as ranged', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        wowClass: 'Warrior',
        wowSpec: 'Arms',
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkSharpshooter('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkAlwaysOnTime ---

describe('checkAlwaysOnTime()', () => {
  it('should return true when last 5 attended raids are all on time', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeAttendanceRecord({
        id: `att-${i}`,
        raidId: `raid-${i}`,
        status: 'attending',
        raid: { raidDate: new Date(`2026-01-${20 - i}T19:00:00Z`) },
      }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkAlwaysOnTime('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false when one of last 5 raids was late', async () => {
    const records = [
      makeAttendanceRecord({ id: 'att-0', raidId: 'raid-0', status: 'attending', raid: { raidDate: new Date('2026-01-20T19:00:00Z') } }),
      makeAttendanceRecord({ id: 'att-1', raidId: 'raid-1', status: 'attending', raid: { raidDate: new Date('2026-01-19T19:00:00Z') } }),
      makeAttendanceRecord({ id: 'att-2', raidId: 'raid-2', status: 'late', raid: { raidDate: new Date('2026-01-18T19:00:00Z') } }),
      makeAttendanceRecord({ id: 'att-3', raidId: 'raid-3', status: 'attending', raid: { raidDate: new Date('2026-01-17T19:00:00Z') } }),
      makeAttendanceRecord({ id: 'att-4', raidId: 'raid-4', status: 'attending', raid: { raidDate: new Date('2026-01-16T19:00:00Z') } }),
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkAlwaysOnTime('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return false with fewer than 5 attended raids', async () => {
    const records = Array.from({ length: 4 }, (_, i) =>
      makeAttendanceRecord({ id: `att-${i}`, status: 'attending' }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkAlwaysOnTime('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkEarlyBird ---

describe('checkEarlyBird()', () => {
  it('should return true when player was first to respond', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({
        respondedAt: new Date('2026-01-15T10:05:00Z'),
        raid: { id: 'raid-1', raidDate: new Date('2026-01-20T19:00:00Z') },
      }),
    ]);
    (mockedPrisma.raidAttendance.findFirst as jest.Mock).mockResolvedValue({
      userId: 'user-1',
    });

    const result = await checkEarlyBird('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false when another player responded first', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([
      makeAttendanceRecord({
        respondedAt: new Date('2026-01-15T10:10:00Z'),
        raid: { id: 'raid-1', raidDate: new Date('2026-01-20T19:00:00Z') },
      }),
    ]);
    (mockedPrisma.raidAttendance.findFirst as jest.Mock).mockResolvedValue({
      userId: 'user-2',
    });

    const result = await checkEarlyBird('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return false when player has no attendance records', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);

    const result = await checkEarlyBird('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkTeamPlayer ---

describe('checkTeamPlayer()', () => {
  it('should return true when player has played 3+ different roles', async () => {
    const records = [
      makeAttendanceRecord({ id: 'att-1', wowClass: 'Warrior', wowSpec: 'Protection' }), // Tank
      makeAttendanceRecord({ id: 'att-2', wowClass: 'Priest', wowSpec: 'Holy' }),         // Healer
      makeAttendanceRecord({ id: 'att-3', wowClass: 'Mage', wowSpec: 'Fire' }),           // Ranged
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkTeamPlayer('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false when player has only 2 different roles', async () => {
    const records = [
      makeAttendanceRecord({ id: 'att-1', wowClass: 'Warrior', wowSpec: 'Protection' }), // Tank
      makeAttendanceRecord({ id: 'att-2', wowClass: 'Warrior', wowSpec: 'Arms' }),        // Melee
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkTeamPlayer('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should not count records without class/spec', async () => {
    const records = [
      makeAttendanceRecord({ id: 'att-1', wowClass: null, wowSpec: null }),
      makeAttendanceRecord({ id: 'att-2', wowClass: null, wowSpec: null }),
      makeAttendanceRecord({ id: 'att-3', wowClass: null, wowSpec: null }),
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkTeamPlayer('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkReliableMember ---

describe('checkReliableMember()', () => {
  it('should return true for 95%+ attendance rate over 30 days', async () => {
    // 19 attending + 1 late = 20/20 = 100%
    const records = [
      ...Array.from({ length: 19 }, (_, i) =>
        makeAttendanceRecord({ id: `att-${i}`, status: 'attending' }),
      ),
      makeAttendanceRecord({ id: 'att-late', status: 'late' }),
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkReliableMember('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return true at exactly 95% threshold', async () => {
    // 19 attending + 1 opted_out = 19/20 = 95%
    const records = [
      ...Array.from({ length: 19 }, (_, i) =>
        makeAttendanceRecord({ id: `att-${i}`, status: 'attending' }),
      ),
      makeAttendanceRecord({ id: 'att-out', status: 'opted_out' }),
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkReliableMember('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false for 90% attendance rate', async () => {
    // 9 attending + 1 opted_out = 9/10 = 90%
    const records = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeAttendanceRecord({ id: `att-${i}`, status: 'attending' }),
      ),
      makeAttendanceRecord({ id: 'att-out', status: 'opted_out' }),
    ];
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkReliableMember('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return false with fewer than 5 raids', async () => {
    const records = Array.from({ length: 4 }, (_, i) =>
      makeAttendanceRecord({ id: `att-${i}`, status: 'attending' }),
    );
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue(records);

    const result = await checkReliableMember('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkRisingStar ---

describe('checkRisingStar()', () => {
  it('should return true for 30%+ improvement in attendance', async () => {
    // Recent: 9/10 = 90%, Older: 5/10 = 50% → 40% improvement
    const recentRecords = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeAttendanceRecord({ id: `att-r-${i}`, status: 'attending' }),
      ),
      makeAttendanceRecord({ id: 'att-r-out', status: 'opted_out' }),
    ];
    const olderRecords = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeAttendanceRecord({ id: `att-o-${i}`, status: 'attending' }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeAttendanceRecord({ id: `att-o-out-${i}`, status: 'opted_out' }),
      ),
    ];

    (mockedPrisma.raidAttendance.findMany as jest.Mock)
      .mockResolvedValueOnce(recentRecords)
      .mockResolvedValueOnce(olderRecords);

    const result = await checkRisingStar('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false for less than 30% improvement', async () => {
    // Recent: 8/10 = 80%, Older: 6/10 = 60% → 20% improvement
    const recentRecords = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeAttendanceRecord({ id: `att-r-${i}`, status: 'attending' }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        makeAttendanceRecord({ id: `att-r-out-${i}`, status: 'opted_out' }),
      ),
    ];
    const olderRecords = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeAttendanceRecord({ id: `att-o-${i}`, status: 'attending' }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeAttendanceRecord({ id: `att-o-out-${i}`, status: 'opted_out' }),
      ),
    ];

    (mockedPrisma.raidAttendance.findMany as jest.Mock)
      .mockResolvedValueOnce(recentRecords)
      .mockResolvedValueOnce(olderRecords);

    const result = await checkRisingStar('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return false with insufficient data in either period', async () => {
    (mockedPrisma.raidAttendance.findMany as jest.Mock)
      .mockResolvedValueOnce([makeAttendanceRecord({ id: 'att-1' })]) // only 1 recent
      .mockResolvedValueOnce([makeAttendanceRecord({ id: 'att-2' })]);

    const result = await checkRisingStar('user-1', 'guild-1');
    expect(result).toBe(false);
  });
});

// --- checkVeteranRaider ---

describe('checkVeteranRaider()', () => {
  it('should return true when player has 25+ attended raids', async () => {
    (mockedPrisma.raidAttendance.count as jest.Mock).mockResolvedValue(25);

    const result = await checkVeteranRaider('user-1', 'guild-1');
    expect(result).toBe(true);
  });

  it('should return false when player has fewer than 25 attended raids', async () => {
    (mockedPrisma.raidAttendance.count as jest.Mock).mockResolvedValue(24);

    const result = await checkVeteranRaider('user-1', 'guild-1');
    expect(result).toBe(false);
  });

  it('should return true when player has more than 25 attended raids', async () => {
    (mockedPrisma.raidAttendance.count as jest.Mock).mockResolvedValue(50);

    const result = await checkVeteranRaider('user-1', 'guild-1');
    expect(result).toBe(true);
  });
});

// --- awardBadge ---

describe('awardBadge()', () => {
  it('should award badge when not already owned', async () => {
    (mockedPrisma.badge.findUnique as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.badge.create as jest.Mock).mockResolvedValue(makeBadge());
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValue([makeBadge()]);
    (mockedPrisma.playerBadgeView.upsert as jest.Mock).mockResolvedValue({});

    const result = await awardBadge('user-1', 'guild-1', 'VETERAN_RAIDER');

    expect(result).toBe(true);
    expect(mockedPrisma.badge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        guildId: 'guild-1',
        badgeType: 'VETERAN_RAIDER',
        awardedBy: null,
        reason: null,
      },
    });
  });

  it('should prevent duplicate badge awards', async () => {
    (mockedPrisma.badge.findUnique as jest.Mock).mockResolvedValue(makeBadge());

    const result = await awardBadge('user-1', 'guild-1', 'VETERAN_RAIDER');

    expect(result).toBe(false);
    expect(mockedPrisma.badge.create).not.toHaveBeenCalled();
  });

  it('should store awardedBy for manual awards', async () => {
    (mockedPrisma.badge.findUnique as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.badge.create as jest.Mock).mockResolvedValue(makeBadge());
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValue([makeBadge()]);
    (mockedPrisma.playerBadgeView.upsert as jest.Mock).mockResolvedValue({});

    await awardBadge('user-1', 'guild-1', 'LEADERS_CHOICE', 'admin-1', 'Great player');

    expect(mockedPrisma.badge.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        guildId: 'guild-1',
        badgeType: 'LEADERS_CHOICE',
        awardedBy: 'admin-1',
        reason: 'Great player',
      },
    });
  });
});

// --- awardManualBadge ---

describe('awardManualBadge()', () => {
  it('should delegate to awardBadge with awardedBy and reason', async () => {
    (mockedPrisma.badge.findUnique as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.badge.create as jest.Mock).mockResolvedValue(makeBadge());
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValue([makeBadge()]);
    (mockedPrisma.playerBadgeView.upsert as jest.Mock).mockResolvedValue({});

    const result = await awardManualBadge('user-1', 'guild-1', 'LEADERS_CHOICE', 'admin-1', 'MVP');

    expect(result).toBe(true);
    expect(mockedPrisma.badge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          awardedBy: 'admin-1',
          reason: 'MVP',
        }),
      }),
    );
  });
});

// --- getBadges ---

describe('getBadges()', () => {
  it('should return all badges for a player', async () => {
    const badges = [
      makeBadge({ badgeType: 'VETERAN_RAIDER', earnedAt: new Date('2026-01-20') }),
      makeBadge({ badgeType: 'TANK_MAIN', earnedAt: new Date('2026-01-15') }),
    ];
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValue(badges);

    const result = await getBadges('user-1', 'guild-1');

    expect(result).toHaveLength(2);
    expect(result[0].badgeType).toBe('VETERAN_RAIDER');
    expect(result[1].badgeType).toBe('TANK_MAIN');
  });

  it('should return empty array when player has no badges', async () => {
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValue([]);

    const result = await getBadges('user-1', 'guild-1');
    expect(result).toHaveLength(0);
  });
});

// --- checkAndAwardBadges ---

describe('checkAndAwardBadges()', () => {
  it('should skip already-owned badges and only check remaining', async () => {
    // Player already has VETERAN_RAIDER
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValueOnce([
      makeBadge({ badgeType: 'VETERAN_RAIDER' }),
    ]);

    // All individual check queries return data that doesn't meet thresholds
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.raidAttendance.count as jest.Mock).mockResolvedValue(0);
    (mockedPrisma.raidAttendance.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await checkAndAwardBadges('user-1', 'guild-1');

    expect(result.existingBadges).toContain('VETERAN_RAIDER');
    expect(result.newBadges).toHaveLength(0);
  });

  it('should award new badges and update badge view', async () => {
    // No existing badges
    (mockedPrisma.badge.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // Initial check for existing badges
      .mockResolvedValueOnce([makeBadge({ badgeType: 'VETERAN_RAIDER' })]); // updateBadgeView query

    // checkVeteranRaider will pass (25+ raids)
    (mockedPrisma.raidAttendance.count as jest.Mock).mockResolvedValue(30);

    // All other checks fail (empty arrays for findMany, null for findFirst)
    (mockedPrisma.raidAttendance.findMany as jest.Mock).mockResolvedValue([]);
    (mockedPrisma.raidAttendance.findFirst as jest.Mock).mockResolvedValue(null);

    // Award badge mocks
    (mockedPrisma.badge.findUnique as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.badge.create as jest.Mock).mockResolvedValue(makeBadge());
    (mockedPrisma.playerBadgeView.upsert as jest.Mock).mockResolvedValue({});

    const result = await checkAndAwardBadges('user-1', 'guild-1');

    expect(result.newBadges).toContain('VETERAN_RAIDER');
    expect(mockedPrisma.playerBadgeView.upsert).toHaveBeenCalled();
  });
});

// --- PlayerBadgeView update ---

describe('Badge view denormalization', () => {
  it('should update badge view with JSON array of badge types on award', async () => {
    (mockedPrisma.badge.findUnique as jest.Mock).mockResolvedValue(null);
    (mockedPrisma.badge.create as jest.Mock).mockResolvedValue(makeBadge());
    (mockedPrisma.badge.findMany as jest.Mock).mockResolvedValue([
      makeBadge({ badgeType: 'VETERAN_RAIDER' }),
      makeBadge({ badgeType: 'TANK_MAIN' }),
    ]);
    (mockedPrisma.playerBadgeView.upsert as jest.Mock).mockResolvedValue({});

    await awardBadge('user-1', 'guild-1', 'TANK_MAIN');

    expect(mockedPrisma.playerBadgeView.upsert).toHaveBeenCalledWith({
      where: { userId_guildId: { userId: 'user-1', guildId: 'guild-1' } },
      update: { badges: JSON.stringify(['VETERAN_RAIDER', 'TANK_MAIN']) },
      create: {
        userId: 'user-1',
        guildId: 'guild-1',
        badges: JSON.stringify(['VETERAN_RAIDER', 'TANK_MAIN']),
      },
    });
  });
});
