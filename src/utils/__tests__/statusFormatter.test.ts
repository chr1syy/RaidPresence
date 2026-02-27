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

    // Tank: 1 (Warrior/Prot), Healer: 1 (Priest/Holy), Melee: 0, Ranged: 2 (Mage/Fire + Hunter/BM)
    expect(desc).toContain('🛡️ 1');
    expect(desc).toContain('💚 1');
    expect(desc).toContain('⚔️ Melee DPS: 0');
    expect(desc).toContain('🏹 Ranged DPS: 2');
  });

  it('should separate melee and ranged DPS counts', () => {
    const attendance = [
      { status: 'attending', wowClass: 'Warrior', wowSpec: 'Arms' }, // Melee
      { status: 'attending', wowClass: 'Rogue', wowSpec: 'Assassination' }, // Melee
      { status: 'attending', wowClass: 'Mage', wowSpec: 'Fire' }, // Ranged
      { status: 'attending', wowClass: 'Hunter', wowSpec: 'Marksmanship' }, // Ranged
      { status: 'attending', wowClass: 'Hunter', wowSpec: 'Survival' }, // Melee
      { status: 'opted_out', wowClass: 'Priest', wowSpec: 'Shadow' }, // Ranged, but opted out
    ];
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    // 3 melee (Warrior, Rogue, Hunter/Surv), 2 ranged (Mage, Hunter/MM), 0 tanks/healers in this test
    expect(desc).toContain('🛡️ 0');
    expect(desc).toContain('💚 0');
    expect(desc).toContain('⚔️ Melee DPS: 3');
    expect(desc).toContain('🏹 Ranged DPS: 2');
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

  it('should handle raid with only tanks and healers (no DPS)', () => {
    const attendance = [
      { status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
      { status: 'attending', wowClass: 'Paladin', wowSpec: 'Protection' },
      { status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
      { status: 'attending', wowClass: 'Druid', wowSpec: 'Restoration' },
    ];
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    expect(desc).toContain('🛡️ 2');
    expect(desc).toContain('💚 2');
    expect(desc).toContain('⚔️ Melee DPS: 0');
    expect(desc).toContain('🏹 Ranged DPS: 0');
  });

  it('should handle large raid with 40 players', () => {
    const attendance = Array.from({ length: 40 }, (_, i) => {
      const classes = ['Warrior', 'Paladin', 'Priest', 'Druid', 'Rogue', 'Mage', 'Hunter'];
      const specs = {
        Warrior: ['Protection', 'Arms'],
        Paladin: ['Protection', 'Holy'],
        Priest: ['Holy', 'Shadow'],
        Druid: ['Restoration', 'Balance'],
        Rogue: ['Assassination'],
        Mage: ['Fire'],
        Hunter: ['Marksmanship']
      };
      const wowClass = classes[i % classes.length];
      const wowSpec = specs[wowClass as keyof typeof specs][0];
      return { status: 'attending', wowClass, wowSpec };
    });
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    // Should contain composition counts without breaking formatting
    expect(desc).toContain('🛡️');
    expect(desc).toContain('💚');
    expect(desc).toContain('⚔️ Melee DPS:');
    expect(desc).toContain('🏹 Ranged DPS:');
    // Should not be ridiculously long or malformed
    expect(desc.length).toBeLessThan(2000);
  });

  it('should handle single DPS player correctly', () => {
    const attendance = [
      { status: 'attending', wowClass: 'Warrior', wowSpec: 'Protection' },
      { status: 'attending', wowClass: 'Priest', wowSpec: 'Holy' },
      { status: 'attending', wowClass: 'Rogue', wowSpec: 'Assassination' }, // Single melee DPS
    ];
    const raids = [makeStatusRaid({ attendance })];
    const embed = formatStatusEmbed(raids, 'en');
    const desc = embed.data.description!;

    expect(desc).toContain('⚔️ Melee DPS: 1');
    expect(desc).toContain('🏹 Ranged DPS: 0');
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
