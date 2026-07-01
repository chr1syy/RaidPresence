/**
 * Unit tests for formatAttendanceEmbed() and helper functions in attendanceFormatter.ts.
 *
 * Tests embed structure, color coding, field content, role distribution display,
 * recent raids formatting, period labels, and localization (en/de).
 */

import { formatAttendanceEmbed } from '../attendanceFormatter';
import { VERSION } from '../version';
import type { PlayerStats, PlayerRoleDistribution, AttendanceHistoryEntry } from '../attendanceAnalytics';

// --- Test Data Factories ---

function makeStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    totalRaidsInvited: 10,
    raidsAttended: 8,
    attendanceRate: 80,
    optedOutCount: 1,
    lateCount: 1,
    reliability: { label: 'Reliable', emoji: '🟡' },
    averageResponseTimeMs: 3600000, // 1 hour
    trend: 'stable',
    ...overrides,
  };
}

function makeRoleDistribution(overrides: Partial<PlayerRoleDistribution> = {}): PlayerRoleDistribution {
  return {
    mainRole: 'Tank',
    altRoles: ['Healer'],
    roleBreakdown: [
      { role: 'Tank', count: 6, percentage: 75 },
      { role: 'Healer', count: 2, percentage: 25 },
    ],
    flexibilityScore: 50,
    ...overrides,
  };
}

function makeRecentRaids(): AttendanceHistoryEntry[] {
  return [
    {
      raidId: 'r1',
      raidDescription: 'Mythic Raid',
      raidDate: new Date('2026-02-08T18:00:00Z'),
      status: 'attending',
      respondedAt: new Date('2026-02-08T12:00:00Z'),
      wowClass: 'Warrior',
      wowSpec: 'Protection',
    },
    {
      raidId: 'r2',
      raidDescription: 'Heroic Clear',
      raidDate: new Date('2026-02-05T18:00:00Z'),
      status: 'opted_out',
      respondedAt: new Date('2026-02-05T10:00:00Z'),
      wowClass: 'Warrior',
      wowSpec: 'Protection',
    },
    {
      raidId: 'r3',
      raidDescription: 'Alt Night',
      raidDate: new Date('2026-02-01T18:00:00Z'),
      status: 'late',
      respondedAt: new Date('2026-02-01T15:00:00Z'),
      wowClass: 'Druid',
      wowSpec: 'Restoration',
    },
  ];
}

// --- Helpers ---

function getField(embed: any, name: string) {
  return embed.data.fields?.find((f: any) => f.name === name);
}

function getFieldNames(embed: any): string[] {
  return embed.data.fields?.map((f: any) => f.name) ?? [];
}

// --- Tests ---

describe('formatAttendanceEmbed()', () => {
  // ── Title ──────────────────────────────────────────────────

  it('should include player name in the title', () => {
    const embed = formatAttendanceEmbed('TestPlayer', makeStats(), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.title).toContain('TestPlayer');
  });

  it('should use localized title format', () => {
    const embed = formatAttendanceEmbed('TestPlayer', makeStats(), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.title).toBe('Attendance Record: TestPlayer');
  });

  // ── Color Coding ───────────────────────────────────────────

  it('should use green color for attendance >= 80%', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ attendanceRate: 80 }), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.color).toBe(0x00ae86);
  });

  it('should use green color for attendance = 100%', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ attendanceRate: 100 }), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.color).toBe(0x00ae86);
  });

  it('should use yellow color for attendance 50-79%', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ attendanceRate: 50 }), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.color).toBe(0xffd700);
  });

  it('should use yellow color for attendance = 79%', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ attendanceRate: 79 }), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.color).toBe(0xffd700);
  });

  it('should use red color for attendance < 50%', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ attendanceRate: 49 }), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.color).toBe(0xff4500);
  });

  it('should use red color for attendance = 0%', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ attendanceRate: 0 }), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.color).toBe(0xff4500);
  });

  // ── Core Stat Fields ───────────────────────────────────────

  it('should display raids invited count', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ totalRaidsInvited: 15 }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Raids Invited');
    expect(field).toBeDefined();
    expect(field.value).toBe('15');
  });

  it('should display raids attended with percentage', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ raidsAttended: 8, attendanceRate: 80 }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Raids Attended');
    expect(field).toBeDefined();
    expect(field.value).toBe('8 (80%)');
  });

  it('should display opted out count', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ optedOutCount: 3 }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Opted Out');
    expect(field).toBeDefined();
    expect(field.value).toBe('3');
  });

  it('should display late count', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ lateCount: 2 }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Running Late');
    expect(field).toBeDefined();
    expect(field.value).toBe('2');
  });

  // ── Reliability Score ──────────────────────────────────────

  it('should display reliability score with emoji and label', () => {
    const embed = formatAttendanceEmbed('P', makeStats({
      reliability: { label: 'Highly Reliable', emoji: '🟢' },
    }), makeRoleDistribution(), [], 'month', 'en');

    const field = getField(embed, 'Reliability Score');
    expect(field).toBeDefined();
    expect(field.value).toContain('🟢');
    expect(field.value).toContain('Highly Reliable');
  });

  it('should display inconsistent reliability', () => {
    const embed = formatAttendanceEmbed('P', makeStats({
      reliability: { label: 'Inconsistent', emoji: '🔴' },
    }), makeRoleDistribution(), [], 'month', 'en');

    const field = getField(embed, 'Reliability Score');
    expect(field.value).toContain('🔴');
    expect(field.value).toContain('Inconsistent');
  });

  // ── Trend ──────────────────────────────────────────────────

  it('should display improving trend with emoji', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ trend: 'improving' }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Trend');
    expect(field).toBeDefined();
    expect(field.value).toContain('↗️');
    expect(field.value).toContain('Improving');
  });

  it('should display stable trend with emoji', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ trend: 'stable' }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Trend');
    expect(field.value).toContain('→');
    expect(field.value).toContain('Stable');
  });

  it('should display declining trend with emoji', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ trend: 'declining' }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Trend');
    expect(field.value).toContain('↘️');
    expect(field.value).toContain('Declining');
  });

  // ── Role Distribution ──────────────────────────────────────

  it('should display main role when present', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution({ mainRole: 'Tank' }), [], 'month', 'en');
    const field = getField(embed, 'Main Role');
    expect(field).toBeDefined();
    expect(field.value).toBe('🛡️ Tank');
  });

  it('should not display main role field when null', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution({ mainRole: null }), [], 'month', 'en');
    const fieldNames = getFieldNames(embed);
    expect(fieldNames).not.toContain('Main Role');
  });

  it('should display alt roles when present', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution({ altRoles: ['Healer', 'Melee'] }), [], 'month', 'en');
    const field = getField(embed, 'Alt Roles');
    expect(field).toBeDefined();
    expect(field.value).toBe('💚 Heal, ⚔️ Melee DPS');
  });

  it('should not display alt roles field when empty', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution({ altRoles: [] }), [], 'month', 'en');
    const fieldNames = getFieldNames(embed);
    expect(fieldNames).not.toContain('Alt Roles');
  });

  // ── Average Response Time ──────────────────────────────────

  it('should display formatted response time', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ averageResponseTimeMs: 3600000 }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Avg Response Time');
    expect(field).toBeDefined();
    expect(field.value).toBe('1h 0m');
  });

  it('should display N/A when response time is null', () => {
    const embed = formatAttendanceEmbed('P', makeStats({ averageResponseTimeMs: null }), makeRoleDistribution(), [], 'month', 'en');
    const field = getField(embed, 'Avg Response Time');
    expect(field.value).toBe('N/A');
  });

  // ── Recent Raids ───────────────────────────────────────────

  it('should display recent raids with status icons', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), makeRecentRaids(), 'month', 'en');
    const field = getField(embed, 'Recent Raids');
    expect(field).toBeDefined();
    // attending => ✅, opted_out => ❌, late => ✅
    expect(field.value).toContain('✅');
    expect(field.value).toContain('❌');
    expect(field.value).toContain('Mythic Raid');
    expect(field.value).toContain('Heroic Clear');
    expect(field.value).toContain('Alt Night');
  });

  it('should show late raids as attended (✅)', () => {
    const raids: AttendanceHistoryEntry[] = [
      {
        raidId: 'r1',
        raidDescription: 'Late Night',
        raidDate: new Date('2026-02-08T18:00:00Z'),
        status: 'late',
        respondedAt: null,
        wowClass: null,
        wowSpec: null,
      },
    ];
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), raids, 'month', 'en');
    const field = getField(embed, 'Recent Raids');
    expect(field.value).toContain('✅');
    expect(field.value).toContain('Late Night');
  });

  it('should not display recent raids field when empty', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'month', 'en');
    const fieldNames = getFieldNames(embed);
    expect(fieldNames).not.toContain('Recent Raids');
  });

  it('should include date in recent raids entries', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), makeRecentRaids(), 'month', 'en');
    const field = getField(embed, 'Recent Raids');
    expect(field.value).toContain('2026-02-08');
    expect(field.value).toContain('2026-02-05');
  });

  it('should use "Raid" as fallback when raidDescription is null', () => {
    const raids: AttendanceHistoryEntry[] = [
      {
        raidId: 'r1',
        raidDescription: null,
        raidDate: new Date('2026-02-08T18:00:00Z'),
        status: 'attending',
        respondedAt: null,
        wowClass: null,
        wowSpec: null,
      },
    ];
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), raids, 'month', 'en');
    const field = getField(embed, 'Recent Raids');
    expect(field.value).toContain('Raid');
  });

  // ── Footer / Period Label ──────────────────────────────────

  it('should show "Last 30 days" footer for month period', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'month', 'en');
    expect(embed.data.footer?.text).toBe(`Last 30 days | v${VERSION}`);
  });

  it('should show "Last 90 days" footer for quarter period', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'quarter', 'en');
    expect(embed.data.footer?.text).toBe(`Last 90 days | v${VERSION}`);
  });

  it('should show "All time" footer for all period', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'all', 'en');
    expect(embed.data.footer?.text).toBe(`All time | v${VERSION}`);
  });

  it('should default to month period for unknown period string', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'unknown', 'en');
    expect(embed.data.footer?.text).toBe(`Last 30 days | v${VERSION}`);
  });

  it('should include a Links field with clickable web link', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'month', 'en');
    const linksField = getField(embed, 'Links');
    expect(linksField.value).toBe('[Web](https://raidpresence.dev) • [Vote](https://raidpresence.dev/vote)');
    expect(linksField.inline).toBe(false);
  });

  // ── Inline Layout ──────────────────────────────────────────

  it('should use inline fields for stat pairs', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'month', 'en');
    const invitedField = getField(embed, 'Raids Invited');
    const attendedField = getField(embed, 'Raids Attended');
    expect(invitedField.inline).toBe(true);
    expect(attendedField.inline).toBe(true);
  });

  it('should use non-inline for recent raids', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), makeRecentRaids(), 'month', 'en');
    const field = getField(embed, 'Recent Raids');
    expect(field.inline).toBe(false);
  });

  // ── Localization (German) ──────────────────────────────────

  it('should use German title when language is "de"', () => {
    const embed = formatAttendanceEmbed('TestPlayer', makeStats(), makeRoleDistribution(), [], 'month', 'de');
    expect(embed.data.title).toContain('Anwesenheit');
    expect(embed.data.title).toContain('TestPlayer');
  });

  it('should use German field labels when language is "de"', () => {
    const embed = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), makeRecentRaids(), 'month', 'de');
    const fieldNames = getFieldNames(embed);
    expect(fieldNames).toContain('Raids eingeladen');
    expect(fieldNames).toContain('Raids teilgenommen');
    expect(fieldNames).toContain('Abgemeldet');
    expect(fieldNames).toContain('Verspätet');
    expect(fieldNames).toContain('Zuverlässigkeit');
    expect(fieldNames).toContain('Trend');
    expect(fieldNames).toContain('Hauptrolle');
    expect(fieldNames).toContain('Nebenrollen');
    expect(fieldNames).toContain('Durchschn. Antwortzeit');
    expect(fieldNames).toContain('Letzte Raids');
  });

  it('should use German period labels in footer', () => {
    const embedMonth = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'month', 'de');
    expect(embedMonth.data.footer?.text).toBe(`Letzte 30 Tage | v${VERSION}`);

    const embedQuarter = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'quarter', 'de');
    expect(embedQuarter.data.footer?.text).toBe(`Letzte 90 Tage | v${VERSION}`);

    const embedAll = formatAttendanceEmbed('P', makeStats(), makeRoleDistribution(), [], 'all', 'de');
    expect(embedAll.data.footer?.text).toBe(`Gesamt | v${VERSION}`);
  });

  // ── Edge Cases ─────────────────────────────────────────────

  it('should handle zero stats with no role distribution gracefully', () => {
    const zeroStats = makeStats({
      totalRaidsInvited: 0,
      raidsAttended: 0,
      attendanceRate: 0,
      optedOutCount: 0,
      lateCount: 0,
      averageResponseTimeMs: null,
    });
    const emptyRoles = makeRoleDistribution({ mainRole: null, altRoles: [], roleBreakdown: [] });

    const embed = formatAttendanceEmbed('NewPlayer', zeroStats, emptyRoles, [], 'month', 'en');

    expect(embed.data.title).toContain('NewPlayer');
    expect(embed.data.color).toBe(0xff4500); // red for 0%

    const invitedField = getField(embed, 'Raids Invited');
    expect(invitedField.value).toBe('0');

    const responseField = getField(embed, 'Avg Response Time');
    expect(responseField.value).toBe('N/A');

    // No main role or alt roles
    const fieldNames = getFieldNames(embed);
    expect(fieldNames).not.toContain('Main Role');
    expect(fieldNames).not.toContain('Alt Roles');
    expect(fieldNames).not.toContain('Recent Raids');
  });

  it('should show alt roles with melee and ranged DPS properly formatted', () => {
    const roleDistribution = makeRoleDistribution({
      altRoles: ['Melee', 'Ranged'],
    });
    const embed = formatAttendanceEmbed('P', makeStats(), roleDistribution, [], 'month', 'en');

    const altRolesField = getField(embed, 'Alt Roles');
    expect(altRolesField.value).toBe('⚔️ Melee DPS, 🏹 Ranged DPS');
  });

  it('should handle player with only melee DPS role', () => {
    const roleDistribution = makeRoleDistribution({
      mainRole: 'Melee',
      altRoles: [],
    });
    const embed = formatAttendanceEmbed('MeleePlayer', makeStats(), roleDistribution, [], 'month', 'en');

    const mainRoleField = getField(embed, 'Main Role');
    expect(mainRoleField.value).toBe('⚔️ Melee DPS');
  });

  it('should handle player with only ranged DPS role', () => {
    const roleDistribution = makeRoleDistribution({
      mainRole: 'Ranged',
      altRoles: [],
    });
    const embed = formatAttendanceEmbed('RangedPlayer', makeStats(), roleDistribution, [], 'month', 'en');

    const mainRoleField = getField(embed, 'Main Role');
    expect(mainRoleField.value).toBe('🏹 Ranged DPS');
  });
});
