/**
 * Test suite for statusFormatter utility functions.
 * Tests: formatStatusEmbed, getRosterStatus, edge cases.
 */

import { formatStatusEmbed, getRosterStatus, StatusRaid } from '../statusFormatter';

function makeStatusRaid(overrides: Partial<StatusRaid> = {}): StatusRaid {
  return {
    id: 'raid-1',
    description: 'Mythic Raid Night',
    raidDate: new Date('2026-03-01T18:00:00Z'),
    status: 'open',
    attendance: [
      { status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
      { status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
      { status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' },
      { status: 'opted_out', wowClass: 'Rogue', wowSpec: 'Assassination' },
      { status: 'late', wowClass: 'Hunter', wowSpec: 'Beast Mastery' },
    ],
    ...overrides,
  };
}

describe('getRosterStatus', () => {
  it('should return "full" when attendance >= 80%', () => {
    expect(getRosterStatus(8, 10)).toBe('full');
    expect(getRosterStatus(10, 10)).toBe('full');
  });

  it('should return "good" when attendance >= 50% and < 80%', () => {
    expect(getRosterStatus(5, 10)).toBe('good');
    expect(getRosterStatus(7, 10)).toBe('good');
  });

  it('should return "low" when attendance < 50%', () => {
    expect(getRosterStatus(2, 10)).toBe('low');
    expect(getRosterStatus(0, 10)).toBe('low');
  });

  it('should return "low" for zero total', () => {
    expect(getRosterStatus(0, 0)).toBe('low');
  });
});

describe('formatStatusEmbed', () => {
  it('should return no-raids embed when empty array', () => {
    const embed = formatStatusEmbed([], 'en');
    const data = embed.data;

    expect(data.title).toBe('Upcoming Raids');
    expect(data.description).toBe('No upcoming raids scheduled.');
    expect(data.color).toBe(0x808080);
  });

  it('should display single raid correctly', () => {
    const raids = [makeStatusRaid()];
    const embed = formatStatusEmbed(raids, 'en');
    const data = embed.data;

    expect(data.title).toBe('Upcoming Raids');
    expect(data.description).toContain('Mythic Raid Night');
    expect(data.description).toContain('1️⃣');
    // 4 attending+late out of 5 total = 80% => FULL
    expect(data.description).toContain('4/5');
    expect(data.description).toContain('80%');
    expect(data.description).toContain('FULL');
  });

  it('should show role composition counts', () => {
    const raids = [makeStatusRaid()];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    // Tank: 1 (Warrior/Prot), Healer: 1 (Priest/Holy), DPS: 2 (Mage/Fire + Hunter/BM)
    expect(desc).toContain('🛡️ 1');
    expect(desc).toContain('💚 1');
    expect(desc).toContain('⚔️ 2');
  });

  it('should display up to 7 raids with number emojis', () => {
    const raids = Array.from({ length: 7 }, (_, i) =>
      makeStatusRaid({
        id: `raid-${i + 1}`,
        description: `Raid ${i + 1}`,
        raidDate: new Date(`2026-03-0${i + 1}T18:00:00Z`),
      })
    );
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    expect(desc).toContain('1️⃣');
    expect(desc).toContain('7️⃣');
    expect(desc).toContain('Raid 1');
    expect(desc).toContain('Raid 7');
  });

  it('should cap at 7 raids even if more provided', () => {
    const raids = Array.from({ length: 10 }, (_, i) =>
      makeStatusRaid({
        id: `raid-${i + 1}`,
        description: `Raid ${i + 1}`,
        raidDate: new Date(Date.now() + (i + 1) * 86400000),
      })
    );
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    // Should contain raids 1-7 but not 8-10
    expect(desc).toContain('Raid 7');
    expect(desc).not.toContain('Raid 8');
  });

  it('should use green color when all raids are full', () => {
    const allAttending = Array.from({ length: 10 }, () => ({
      status: 'attending',
      wowClass: 'Warrior',
      wowSpec: 'Arms',
    }));
    const raids = [makeStatusRaid({ attendance: allAttending })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.color).toBe(0x00ae86);
  });

  it('should use yellow color when worst raid is "good"', () => {
    // 6/10 = 60% => GOOD
    const mixedAttendance = [
      ...Array.from({ length: 6 }, () => ({ status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' })),
      ...Array.from({ length: 4 }, () => ({ status: 'opted_out', wowClass: null, wowSpec: null })),
    ];
    const raids = [makeStatusRaid({ attendance: mixedAttendance })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.color).toBe(0xffd700);
  });

  it('should use red color when any raid is "low"', () => {
    // 2/10 = 20% => LOW
    const lowAttendance = [
      ...Array.from({ length: 2 }, () => ({ status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' })),
      ...Array.from({ length: 8 }, () => ({ status: 'opted_out', wowClass: null, wowSpec: null })),
    ];
    const raids = [makeStatusRaid({ attendance: lowAttendance })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.color).toBe(0xff4500);
  });

  it('should use German translations', () => {
    const raids = [makeStatusRaid()];
    const embed = formatStatusEmbed(raids, 'de');
    const data = embed.data;

    expect(data.title).toBe('Anstehende Raids');
    expect(data.description).toContain('Aufstellung');
    expect(data.description).toContain('VOLL');
  });

  it('should display German no-raids message', () => {
    const embed = formatStatusEmbed([], 'de');
    expect(embed.data.description).toBe('Keine anstehenden Raids geplant.');
  });

  it('should fallback to raidEvent for null description', () => {
    const raids = [makeStatusRaid({ description: null })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.description).toContain('Raid Event');
  });

  it('should include Discord timestamps for relative and absolute time', () => {
    const raidDate = new Date('2026-03-01T18:00:00Z');
    const timestamp = Math.floor(raidDate.getTime() / 1000);
    const raids = [makeStatusRaid({ raidDate })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.description).toContain(`<t:${timestamp}:F>`);
    expect(embed.data.description).toContain(`<t:${timestamp}:R>`);
  });

  it('should count late players as attending for roster calculations', () => {
    const attendance = [
      { status: 'late', wowClass: 'Warrior', wowSpec: 'Protection' },
      { status: 'late', wowClass: 'Priest', wowSpec: 'Holy' },
      { status: 'opted_out', wowClass: 'Mage', wowSpec: 'Fire' },
    ];
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    // 2 late out of 3 total (66.7%) => GOOD
    expect(desc).toContain('2/3');
    expect(desc).toContain('67%');
    expect(desc).toContain('GOOD');
  });

  it('should handle raid with zero attendance', () => {
    const raids = [makeStatusRaid({ attendance: [] })];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    expect(desc).toContain('0/0');
    expect(desc).toContain('0%');
    expect(desc).toContain('LOW');
  });

  it('should show GOOD status indicator with checkmark', () => {
    // 6/10 = 60% => GOOD
    const attendance = [
      ...Array.from({ length: 6 }, () => ({ status: 'attending', wowClass: null, wowSpec: null })),
      ...Array.from({ length: 4 }, () => ({ status: 'opted_out', wowClass: null, wowSpec: null })),
    ];
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.description).toContain('✅ GOOD');
  });

  it('should show LOW status indicator with warning', () => {
    const attendance = [
      { status: 'attending', wowClass: null, wowSpec: null },
      ...Array.from({ length: 9 }, () => ({ status: 'opted_out', wowClass: null, wowSpec: null })),
    ];
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');

    expect(embed.data.description).toContain('⚠️ LOW');
  });
});
