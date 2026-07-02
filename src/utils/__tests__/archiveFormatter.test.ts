import { formatArchiveSearchEmbed } from '../archiveFormatter';
import { ArchiveRaidSummary } from '../archiveManager';

function makeResult(overrides: Partial<ArchiveRaidSummary> = {}): ArchiveRaidSummary {
  return {
    raidId: 'raid_1',
    description: 'Molten Core',
    raidDate: new Date('2026-01-01T20:00:00Z'),
    attendedCount: 20,
    totalInvited: 25,
    attendancePercent: 80,
    participantNames: ['Alice', 'Bob'],
    archivedAt: new Date('2026-01-02T00:00:00Z'),
    archiveChannelId: 'chan_1',
    ...overrides,
  };
}

describe('formatArchiveSearchEmbed()', () => {
  it('caps a huge participant roster to stay within the 1024-char field limit', () => {
    // A raid with a very large roster would otherwise blow past Discord's limit
    // and make the API reject the whole embed.
    const hugeRoster = Array.from({ length: 500 }, (_, i) => `Player${i}`);
    const embed = formatArchiveSearchEmbed([makeResult({ participantNames: hugeRoster })], null, null, 'en').toJSON();

    const field = embed.fields?.find((f) => f.name === 'Molten Core');
    expect(field).toBeDefined();
    expect(field!.value.length).toBeLessThanOrEqual(1024);
    expect(field!.value).toContain('…');
  });

  it('leaves a normal-sized roster untouched', () => {
    const embed = formatArchiveSearchEmbed([makeResult()], null, null, 'en').toJSON();
    const field = embed.fields?.find((f) => f.name === 'Molten Core');
    expect(field!.value).toContain('Alice, Bob');
    expect(field!.value).not.toContain('…');
  });

  it('never emits more than 10 result fields even for a large result set', () => {
    const many = Array.from({ length: 25 }, (_, i) => makeResult({ raidId: `raid_${i}`, description: `Raid ${i}` }));
    const embed = formatArchiveSearchEmbed(many, null, null, 'en').toJSON();
    // 10 result fields + the trailing links field.
    const resultFields = embed.fields?.filter((f) => f.name.startsWith('Raid ')) ?? [];
    expect(resultFields.length).toBe(10);
    expect((embed.fields?.length ?? 0)).toBeLessThanOrEqual(25);
  });
});
