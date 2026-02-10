import {
  calculateRaidStats,
  calculateGuildStats,
  getReliabilityScore,
  AttendanceRecord,
} from '../statsCalculator';

// Helper to build attendance records
function makeAttendance(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    userId: 'user-1',
    username: 'Player1',
    status: 'attending',
    wowClass: null,
    wowSpec: null,
    ...overrides,
  };
}

describe('calculateRaidStats()', () => {
  it('should calculate correct stats for a standard raid', () => {
    const attendance: AttendanceRecord[] = [
      makeAttendance({ userId: 'u1', username: 'Tank1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }),
      makeAttendance({ userId: 'u2', username: 'Healer1', status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' }),
      makeAttendance({ userId: 'u3', username: 'DPS1', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' }),
      makeAttendance({ userId: 'u4', username: 'DPS2', status: 'attending', wowClass: 'Rogue', wowSpec: 'Assassination' }),
      makeAttendance({ userId: 'u5', username: 'OptedOut1', status: 'opted_out', wowClass: 'Hunter', wowSpec: 'Marksmanship' }),
    ];

    const stats = calculateRaidStats(attendance);

    expect(stats.totalMembers).toBe(5);
    expect(stats.attendingCount).toBe(4);
    expect(stats.optedOutCount).toBe(1);
    expect(stats.lateCount).toBe(0);
    expect(stats.attendanceRate).toBe(80);
    expect(stats.composition.tanks).toBe(1);
    expect(stats.composition.healers).toBe(1);
    expect(stats.composition.melee).toBe(1); // Rogue
    expect(stats.composition.ranged).toBe(1); // Mage
    expect(stats.composition.noClass).toBe(0);
  });

  it('should handle 0 attendance (empty raid)', () => {
    const stats = calculateRaidStats([]);

    expect(stats.totalMembers).toBe(0);
    expect(stats.attendingCount).toBe(0);
    expect(stats.optedOutCount).toBe(0);
    expect(stats.lateCount).toBe(0);
    expect(stats.attendanceRate).toBe(0);
    expect(stats.composition.tanks).toBe(0);
    expect(stats.classDistribution).toEqual([]);
  });

  it('should include late players in composition', () => {
    const attendance: AttendanceRecord[] = [
      makeAttendance({ userId: 'u1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }),
      makeAttendance({ userId: 'u2', status: 'late', wowClass: 'Paladin', wowSpec: 'Holy' }),
    ];

    const stats = calculateRaidStats(attendance);

    expect(stats.attendingCount).toBe(1);
    expect(stats.lateCount).toBe(1);
    // Both attending and late should be in composition
    expect(stats.composition.tanks).toBe(1);
    expect(stats.composition.healers).toBe(1);
  });

  it('should count members without class/spec as noClass', () => {
    const attendance: AttendanceRecord[] = [
      makeAttendance({ userId: 'u1', status: 'attending', wowClass: null, wowSpec: null }),
      makeAttendance({ userId: 'u2', status: 'attending', wowClass: 'Warrior', wowSpec: null }),
    ];

    const stats = calculateRaidStats(attendance);

    // Both have no valid spec role (getSpecRole returns null for null spec)
    expect(stats.composition.noClass).toBe(2);
  });

  it('should handle all opted out', () => {
    const attendance: AttendanceRecord[] = [
      makeAttendance({ userId: 'u1', status: 'opted_out' }),
      makeAttendance({ userId: 'u2', status: 'opted_out' }),
      makeAttendance({ userId: 'u3', status: 'opted_out' }),
    ];

    const stats = calculateRaidStats(attendance);

    expect(stats.totalMembers).toBe(3);
    expect(stats.attendingCount).toBe(0);
    expect(stats.optedOutCount).toBe(3);
    expect(stats.attendanceRate).toBe(0);
    expect(stats.composition.tanks).toBe(0);
  });

  it('should calculate class distribution sorted by frequency', () => {
    const attendance: AttendanceRecord[] = [
      makeAttendance({ userId: 'u1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' }),
      makeAttendance({ userId: 'u2', status: 'attending', wowClass: 'Warrior', wowSpec: 'Fury' }),
      makeAttendance({ userId: 'u3', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' }),
      makeAttendance({ userId: 'u4', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }),
      makeAttendance({ userId: 'u5', status: 'attending', wowClass: 'Mage', wowSpec: 'Frost' }),
    ];

    const stats = calculateRaidStats(attendance);

    expect(stats.classDistribution[0]).toEqual({ className: 'Warrior', count: 3 });
    expect(stats.classDistribution[1]).toEqual({ className: 'Mage', count: 2 });
  });

  it('should calculate attendance rate with correct precision', () => {
    // 1 out of 3 = 33.3%
    const attendance: AttendanceRecord[] = [
      makeAttendance({ userId: 'u1', status: 'attending' }),
      makeAttendance({ userId: 'u2', status: 'opted_out' }),
      makeAttendance({ userId: 'u3', status: 'opted_out' }),
    ];

    const stats = calculateRaidStats(attendance);

    expect(stats.attendanceRate).toBe(33.3);
  });
});

describe('calculateGuildStats()', () => {
  it('should calculate correct aggregate stats for multiple raids', () => {
    const raids = [
      {
        id: 'raid-1',
        attendance: [
          makeAttendance({ userId: 'u1', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }),
          makeAttendance({ userId: 'u2', username: 'Player2', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' }),
          makeAttendance({ userId: 'u3', username: 'Player3', status: 'opted_out', wowClass: 'Rogue', wowSpec: 'Outlaw' }),
        ],
      },
      {
        id: 'raid-2',
        attendance: [
          makeAttendance({ userId: 'u1', username: 'Player1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' }),
          makeAttendance({ userId: 'u2', username: 'Player2', status: 'opted_out', wowClass: 'Mage', wowSpec: 'Fire' }),
          makeAttendance({ userId: 'u3', username: 'Player3', status: 'attending', wowClass: 'Rogue', wowSpec: 'Outlaw' }),
        ],
      },
    ];

    const stats = calculateGuildStats(raids);

    expect(stats.totalRaids).toBe(2);
    expect(stats.totalRaiders).toBe(3);
    // Raid 1: 2/3 = 66.7%, Raid 2: 2/3 = 66.7% => avg 66.7%
    expect(stats.averageAttendanceRate).toBe(66.7);
  });

  it('should handle 0 raids', () => {
    const stats = calculateGuildStats([]);

    expect(stats.totalRaids).toBe(0);
    expect(stats.averageAttendanceRate).toBe(0);
    expect(stats.totalRaiders).toBe(0);
    expect(stats.topAttendees).toEqual([]);
    expect(stats.classDistribution).toEqual([]);
  });

  it('should sort top attendees by attendance rate then raids attended', () => {
    const raids = [
      {
        id: 'raid-1',
        attendance: [
          makeAttendance({ userId: 'u1', username: 'Always', status: 'attending' }),
          makeAttendance({ userId: 'u2', username: 'Sometimes', status: 'attending' }),
          makeAttendance({ userId: 'u3', username: 'Never', status: 'opted_out' }),
        ],
      },
      {
        id: 'raid-2',
        attendance: [
          makeAttendance({ userId: 'u1', username: 'Always', status: 'attending' }),
          makeAttendance({ userId: 'u2', username: 'Sometimes', status: 'opted_out' }),
          makeAttendance({ userId: 'u3', username: 'Never', status: 'opted_out' }),
        ],
      },
    ];

    const stats = calculateGuildStats(raids);

    expect(stats.topAttendees[0].username).toBe('Always');
    expect(stats.topAttendees[0].attendanceRate).toBe(100);
    expect(stats.topAttendees[1].username).toBe('Sometimes');
    expect(stats.topAttendees[1].attendanceRate).toBe(50);
    expect(stats.topAttendees[2].username).toBe('Never');
    expect(stats.topAttendees[2].attendanceRate).toBe(0);
  });

  it('should limit top attendees to 10', () => {
    // Create a raid with 15 players
    const attendance: AttendanceRecord[] = [];
    for (let i = 0; i < 15; i++) {
      attendance.push(makeAttendance({ userId: `u${i}`, username: `Player${i}`, status: 'attending' }));
    }

    const stats = calculateGuildStats([{ id: 'raid-1', attendance }]);

    expect(stats.topAttendees.length).toBe(10);
  });

  it('should count late players as attending in guild stats', () => {
    const raids = [
      {
        id: 'raid-1',
        attendance: [
          makeAttendance({ userId: 'u1', username: 'Player1', status: 'late' }),
          makeAttendance({ userId: 'u2', username: 'Player2', status: 'opted_out' }),
        ],
      },
    ];

    const stats = calculateGuildStats(raids);

    // 1 late out of 2 total = 50%
    expect(stats.averageAttendanceRate).toBe(50);
    expect(stats.topAttendees[0].username).toBe('Player1');
    expect(stats.topAttendees[0].raidsAttended).toBe(1);
  });

  it('should handle raid with empty attendance array in guild stats', () => {
    const raids = [
      {
        id: 'raid-1',
        attendance: [], // empty raid
      },
      {
        id: 'raid-2',
        attendance: [
          makeAttendance({ userId: 'u1', username: 'Player1', status: 'attending' }),
        ],
      },
    ];

    const stats = calculateGuildStats(raids);

    expect(stats.totalRaids).toBe(2);
    expect(stats.totalRaiders).toBe(1);
    // Raid 1: 0/0 = 0%, Raid 2: 1/1 = 100% => avg 50%
    expect(stats.averageAttendanceRate).toBe(50);
  });

  it('should calculate guild class distribution from active players across raids', () => {
    const raids = [
      {
        id: 'raid-1',
        attendance: [
          makeAttendance({ userId: 'u1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' }),
          makeAttendance({ userId: 'u2', status: 'opted_out', wowClass: 'Mage', wowSpec: 'Fire' }),
        ],
      },
      {
        id: 'raid-2',
        attendance: [
          makeAttendance({ userId: 'u1', status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' }),
          makeAttendance({ userId: 'u2', status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' }),
        ],
      },
    ];

    const stats = calculateGuildStats(raids);

    // Warrior attended both raids (2 instances), Mage attended 1 raid
    expect(stats.classDistribution[0]).toEqual({ className: 'Warrior', count: 2 });
    expect(stats.classDistribution[1]).toEqual({ className: 'Mage', count: 1 });
  });
});

describe('getReliabilityScore()', () => {
  it('should return "Highly Reliable" for 95%+', () => {
    const result = getReliabilityScore(95);
    expect(result.label).toBe('Highly Reliable');
    expect(result.emoji).toBe('\uD83D\uDFE2');
  });

  it('should return "Highly Reliable" for 100%', () => {
    const result = getReliabilityScore(100);
    expect(result.label).toBe('Highly Reliable');
  });

  it('should return "Reliable" for 80%', () => {
    const result = getReliabilityScore(80);
    expect(result.label).toBe('Reliable');
    expect(result.emoji).toBe('\uD83D\uDFE1');
  });

  it('should return "Reliable" for 94%', () => {
    const result = getReliabilityScore(94);
    expect(result.label).toBe('Reliable');
  });

  it('should return "Inconsistent" for below 80%', () => {
    const result = getReliabilityScore(79);
    expect(result.label).toBe('Inconsistent');
    expect(result.emoji).toBe('\uD83D\uDD34');
  });

  it('should return "Inconsistent" for 0%', () => {
    const result = getReliabilityScore(0);
    expect(result.label).toBe('Inconsistent');
  });
});
