/**
 * Test suite for statsFormatter utility functions.
 * Tests: formatRaidStatsEmbed, formatGuildStatsEmbed with various
 * data shapes, languages, and edge cases.
 */

import { formatRaidStatsEmbed, formatGuildStatsEmbed } from '../statsFormatter';
import type { RaidStats, GuildStats } from '../statsCalculator';

function makeRaidStats(overrides: Partial<RaidStats> = {}): RaidStats {
  return {
    totalMembers: 10,
    attendingCount: 7,
    optedOutCount: 2,
    lateCount: 1,
    attendanceRate: 70,
    composition: { tanks: 2, healers: 2, melee: 1, ranged: 2, noClass: 0 },
    classDistribution: [
      { className: 'Warrior', count: 2 },
      { className: 'Priest', count: 2 },
      { className: 'Mage', count: 1 },
      { className: 'Hunter', count: 1 },
      { className: 'Rogue', count: 1 },
    ],
    ...overrides,
  };
}

function makeGuildStats(overrides: Partial<GuildStats> = {}): GuildStats {
  return {
    totalRaids: 5,
    averageAttendanceRate: 85,
    totalRaiders: 20,
    topAttendees: [
      { userId: 'u1', username: 'Player1', raidsAttended: 5, totalRaids: 5, attendanceRate: 100 },
      { userId: 'u2', username: 'Player2', raidsAttended: 4, totalRaids: 5, attendanceRate: 80 },
      { userId: 'u3', username: 'Player3', raidsAttended: 3, totalRaids: 5, attendanceRate: 60 },
    ],
    classDistribution: [
      { className: 'Warrior', count: 8 },
      { className: 'Mage', count: 6 },
      { className: 'Priest', count: 4 },
    ],
    ...overrides,
  };
}

describe('formatRaidStatsEmbed', () => {
  it('should build an embed with the raid title', () => {
    const embed = formatRaidStatsEmbed(
      { id: 'raid-1', description: 'Mythic Night' },
      makeRaidStats(),
      'en',
    );
    expect(embed.data.title).toContain('Mythic Night');
  });

  it('should fall back to "Raid" when description is null', () => {
    const embed = formatRaidStatsEmbed(
      { id: 'raid-1', description: null },
      makeRaidStats(),
      'en',
    );
    expect(embed.data.title).toContain('Raid');
  });

  it('should include attendance rate field', () => {
    const stats = makeRaidStats({ attendingCount: 7, totalMembers: 10, attendanceRate: 70 });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Attendance Rate');
    expect(field).toBeDefined();
    expect(field!.value).toContain('7/10');
    expect(field!.value).toContain('70%');
  });

  it('should include reliability field with emoji', () => {
    const stats = makeRaidStats({ attendanceRate: 96 });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Reliability');
    expect(field).toBeDefined();
    expect(field!.value).toContain('Highly Reliable');
  });

  it('should include attending, opted out, and late counts', () => {
    const stats = makeRaidStats({ attendingCount: 5, optedOutCount: 3, lateCount: 2 });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    const fields = embed.data.fields!;

    expect(fields.find((f) => f.name === 'Attending')!.value).toBe('5');
    expect(fields.find((f) => f.name === 'Opted Out')!.value).toBe('3');
    expect(fields.find((f) => f.name === 'Running Late')!.value).toBe('2');
  });

  it('should include role composition', () => {
    const stats = makeRaidStats({
      composition: { tanks: 2, healers: 3, melee: 4, ranged: 5, noClass: 0 },
    });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Role Composition');
    expect(field).toBeDefined();
    expect(field!.value).toContain('Tank: 2');
    expect(field!.value).toContain('Heal: 3');
    expect(field!.value).toContain('Melee DPS: 4');
    expect(field!.value).toContain('Ranged DPS: 5');
  });

  it('should include class distribution', () => {
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, makeRaidStats(), 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Class Distribution');
    expect(field).toBeDefined();
    expect(field!.value).toContain('Warrior: 2');
    expect(field!.value).toContain('Priest: 2');
  });

  it('should show dash when class distribution is empty', () => {
    const stats = makeRaidStats({ classDistribution: [] });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Class Distribution');
    expect(field!.value).toBe('-');
  });

  it('should include a Links field with clickable web link', () => {
    const embed = formatRaidStatsEmbed({ id: 'my-raid-42', description: 'Test' }, makeRaidStats(), 'en');
    const linksField = embed.data.fields!.find((f) => f.name === 'Links');
    expect(linksField!.value).toBe('[Web](https://raidpresence.dev)');
    expect(linksField!.inline).toBe(true);
  });

  it('should use green color for high attendance (>=80)', () => {
    const stats = makeRaidStats({ attendanceRate: 90 });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    expect(embed.data.color).toBe(0x00ae86);
  });

  it('should use yellow color for moderate attendance (50-79)', () => {
    const stats = makeRaidStats({ attendanceRate: 65 });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    expect(embed.data.color).toBe(0xffd700);
  });

  it('should use red color for low attendance (<50)', () => {
    const stats = makeRaidStats({ attendanceRate: 30 });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    expect(embed.data.color).toBe(0xff4500);
  });

  it('should use German translations when language is de', () => {
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Mythic' }, makeRaidStats(), 'de');
    expect(embed.data.title).toContain('Statistiken:');

    const fieldNames = embed.data.fields!.map((f) => f.name);
    expect(fieldNames).toContain('Teilnahmequote');
    expect(fieldNames).toContain('Zuverlässigkeit');
    expect(fieldNames).toContain('Rollenzusammensetzung');
    expect(fieldNames).toContain('Klassenverteilung');
  });

  it('should handle zero attendance edge case', () => {
    const stats = makeRaidStats({
      totalMembers: 0,
      attendingCount: 0,
      optedOutCount: 0,
      lateCount: 0,
      attendanceRate: 0,
      composition: { tanks: 0, healers: 0, melee: 0, ranged: 0, noClass: 0 },
      classDistribution: [],
    });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Empty' }, stats, 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Attendance Rate');
    expect(field!.value).toContain('0/0');
    expect(field!.value).toContain('0%');
  });

  it('should truncate class distribution to 10 entries', () => {
    const classes = Array.from({ length: 15 }, (_, i) => ({ className: `Class${i}`, count: 15 - i }));
    const stats = makeRaidStats({ classDistribution: classes });
    const embed = formatRaidStatsEmbed({ id: 'r1', description: 'Test' }, stats, 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Class Distribution');
    const lines = field!.value.split('\n');
    expect(lines.length).toBe(10);
    expect(field!.value).toContain('Class0');
    expect(field!.value).not.toContain('Class10');
  });
});

describe('formatGuildStatsEmbed', () => {
  it('should build an embed with period in title (month)', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'month', 'en');
    expect(embed.data.title).toContain('Last 30 days');
  });

  it('should build an embed with period in title (week)', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'week', 'en');
    expect(embed.data.title).toContain('Last 7 days');
  });

  it('should build an embed with period in title (all)', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'all', 'en');
    expect(embed.data.title).toContain('All time');
  });

  it('should include a Links field with clickable web link', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'month', 'en');
    const linksField = embed.data.fields!.find((f) => f.name === 'Links');
    expect(linksField!.value).toBe('[Web](https://raidpresence.dev)');
    expect(linksField!.inline).toBe(true);
  });

  it('should include total raids, attendance rate, and total raiders', () => {
    const stats = makeGuildStats({ totalRaids: 12, averageAttendanceRate: 88.5, totalRaiders: 30 });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');
    const fields = embed.data.fields!;

    expect(fields.find((f) => f.name === 'Total Raids')!.value).toBe('12');
    expect(fields.find((f) => f.name === 'Attendance Rate')!.value).toBe('88.5%');
    expect(fields.find((f) => f.name === 'Total Raiders')!.value).toBe('30');
  });

  it('should include top attendees with reliability scores', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'month', 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Top Attendees');
    expect(field).toBeDefined();
    expect(field!.value).toContain('1. Player1');
    expect(field!.value).toContain('5/5');
    expect(field!.value).toContain('100%');
    expect(field!.value).toContain('2. Player2');
  });

  it('should omit top attendees field when empty', () => {
    const stats = makeGuildStats({ topAttendees: [] });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Top Attendees');
    expect(field).toBeUndefined();
  });

  it('should include class distribution', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'month', 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Class Distribution');
    expect(field).toBeDefined();
    expect(field!.value).toContain('Warrior: 8');
    expect(field!.value).toContain('Mage: 6');
  });

  it('should omit class distribution field when empty', () => {
    const stats = makeGuildStats({ classDistribution: [] });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');
    const field = embed.data.fields!.find((f) => f.name === 'Class Distribution');
    expect(field).toBeUndefined();
  });

  it('should use green color for high attendance (>=80)', () => {
    const stats = makeGuildStats({ averageAttendanceRate: 85 });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');
    expect(embed.data.color).toBe(0x00ae86);
  });

  it('should use yellow color for moderate attendance (50-79)', () => {
    const stats = makeGuildStats({ averageAttendanceRate: 60 });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');
    expect(embed.data.color).toBe(0xffd700);
  });

  it('should use red color for low attendance (<50)', () => {
    const stats = makeGuildStats({ averageAttendanceRate: 30 });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');
    expect(embed.data.color).toBe(0xff4500);
  });

  it('should use German translations when language is de', () => {
    const embed = formatGuildStatsEmbed(makeGuildStats(), 'month', 'de');
    expect(embed.data.title).toContain('Server-Statistiken');
    expect(embed.data.title).toContain('Letzte 30 Tage');

    const fieldNames = embed.data.fields!.map((f) => f.name);
    expect(fieldNames).toContain('Raids insgesamt');
    expect(fieldNames).toContain('Teilnahmequote');
    expect(fieldNames).toContain('Spieler insgesamt');
    expect(fieldNames).toContain('Top-Teilnehmer');
    expect(fieldNames).toContain('Klassenverteilung');
  });

  it('should handle guild stats with zero raids gracefully', () => {
    const stats = makeGuildStats({
      totalRaids: 0,
      averageAttendanceRate: 0,
      totalRaiders: 0,
      topAttendees: [],
      classDistribution: [],
    });
    const embed = formatGuildStatsEmbed(stats, 'month', 'en');

    const fields = embed.data.fields!;
    expect(fields.find((f) => f.name === 'Total Raids')!.value).toBe('0');
    expect(fields.find((f) => f.name === 'Attendance Rate')!.value).toBe('0%');
    expect(fields.find((f) => f.name === 'Total Raiders')!.value).toBe('0');
    // No top attendees or class distribution fields
    expect(fields.find((f) => f.name === 'Top Attendees')).toBeUndefined();
    expect(fields.find((f) => f.name === 'Class Distribution')).toBeUndefined();
  });
});
