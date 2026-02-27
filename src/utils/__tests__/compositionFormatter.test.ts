import { formatCompositionEmbed } from '../compositionFormatter';
import {
  analyzeRaidComposition,
  findCompositionGaps,
  suggestPlayerSwaps,
  calculateSuccessLikelihood,
  CompositionAttendee,
} from '../compositionAnalyzer';

describe('Composition Formatter (raid suggest display)', () => {
  const createAttendee = (overrides: Partial<CompositionAttendee> = {}): CompositionAttendee => ({
    userId: 'user-1',
    username: 'Player1',
    status: 'attending',
    wowClass: null,
    wowSpec: null,
    ...overrides,
  });

  it('should format raid with gaps showing recommendations', () => {
    // Raid with healer gap
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'Healer1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'DPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      createAttendee({ userId: 'u4', username: 'OptedHealer', wowClass: 'Druid', wowSpec: 'Restoration', status: 'opted_out' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Test Raid', analysis, gaps, suggestions, likelihood, 'en');

    expect(embed.data.title).toContain('Composition Analysis');
    expect(embed.data.title).toContain('Test Raid');
    expect(embed.data.color).toBeDefined();
  });

  it('should show color based on raid status', () => {
    // Well-composed raid
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'Tank2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'Healer1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      createAttendee({ userId: 'u4', username: 'DPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      createAttendee({ userId: 'u5', username: 'DPS2', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Ready Raid', analysis, gaps, suggestions, likelihood, 'en');

    // Color should be defined and be a valid Discord color
    expect(embed.data.color).toBeDefined();
    expect(typeof embed.data.color).toBe('number');
    expect(embed.data.color).toBeGreaterThan(0);
    expect(embed.data.color).toBeLessThan(0xffffff);
  });

  it('should show orange color for NEEDS status', () => {
    // Raid with healer gap
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'DPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Gappy Raid', analysis, gaps, suggestions, likelihood, 'en');

    // NEEDS status should produce orange color
    expect(embed.data.color).toBe(0xf39c12); // Orange
  });

  it('should include player suggestions in embed fields', () => {
    // Raid with healer gap and opted-out healer
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'DPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'HealerOptedOut', wowClass: 'Priest', wowSpec: 'Holy', status: 'opted_out' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Test Raid', analysis, gaps, suggestions, likelihood, 'en');

    // Should have player suggestions field
    const fields = embed.data.fields || [];
    const hasPlayerSuggestionsField = fields.some((f: any) => f.name && f.name.includes('Player Suggestion'));
    expect(hasPlayerSuggestionsField).toBe(true);
  });

  it('should include success likelihood in embed fields', () => {
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'DPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Test Raid', analysis, gaps, suggestions, likelihood, 'en');

    // Should have success likelihood field
    const fields = embed.data.fields || [];
    const hasSuccessField = fields.some((f: any) => f.name && f.name.includes('Success Likelihood'));
    expect(hasSuccessField).toBe(true);

    // Should include the percentage
    const successField = fields.find((f: any) => f.name && f.name.includes('Success Likelihood'));
    expect(successField?.value).toContain('%');
  });

  it('should display melee and ranged DPS separately', () => {
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'Healer1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'MeleeDPS1', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
      createAttendee({ userId: 'u4', username: 'RangedDPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      createAttendee({ userId: 'u5', username: 'MeleeDPS2', wowClass: 'Warrior', wowSpec: 'Arms', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Test Raid', analysis, gaps, suggestions, likelihood, 'en');

    expect(embed.data.fields).toBeDefined();
    const currentCompositionField = embed.data.fields!.find((f: any) => f.name === 'Current Composition');
    expect(currentCompositionField).toBeDefined();
    expect(currentCompositionField!.value).toContain('⚔️ Melee DPS: 2');
    expect(currentCompositionField!.value).toContain('🏹 Ranged DPS: 1');
  });

  it('should handle raid with only melee DPS', () => {
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'Healer1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'MeleeDPS1', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
      createAttendee({ userId: 'u4', username: 'MeleeDPS2', wowClass: 'Warrior', wowSpec: 'Arms', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Melee Only Raid', analysis, gaps, suggestions, likelihood, 'en');

    expect(embed.data.fields).toBeDefined();
    const currentCompositionField = embed.data.fields!.find((f: any) => f.name === 'Current Composition');
    expect(currentCompositionField).toBeDefined();
    expect(currentCompositionField!.value).toContain('⚔️ Melee DPS: 2');
    expect(currentCompositionField!.value).toContain('🏹 Ranged DPS: 0');
  });

  it('should handle raid with only ranged DPS', () => {
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'Healer1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'RangedDPS1', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      createAttendee({ userId: 'u4', username: 'RangedDPS2', wowClass: 'Hunter', wowSpec: 'Marksmanship', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('Ranged Only Raid', analysis, gaps, suggestions, likelihood, 'en');

    expect(embed.data.fields).toBeDefined();
    const currentCompositionField = embed.data.fields!.find((f: any) => f.name === 'Current Composition');
    expect(currentCompositionField).toBeDefined();
    expect(currentCompositionField!.value).toContain('⚔️ Melee DPS: 0');
    expect(currentCompositionField!.value).toContain('🏹 Ranged DPS: 2');
  });

  it('should handle raid with no DPS', () => {
    const attendees: CompositionAttendee[] = [
      createAttendee({ userId: 'u1', username: 'Tank1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u2', username: 'Tank2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      createAttendee({ userId: 'u3', username: 'Healer1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      createAttendee({ userId: 'u4', username: 'Healer2', wowClass: 'Druid', wowSpec: 'Restoration', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendees);
    const gaps = findCompositionGaps(attendees);
    const suggestions = suggestPlayerSwaps(attendees, gaps);
    const likelihood = calculateSuccessLikelihood(attendees);

    const embed = formatCompositionEmbed('No DPS Raid', analysis, gaps, suggestions, likelihood, 'en');

    expect(embed.data.fields).toBeDefined();
    const currentCompositionField = embed.data.fields!.find((f: any) => f.name === 'Current Composition');
    expect(currentCompositionField).toBeDefined();
    expect(currentCompositionField!.value).toContain('⚔️ Melee DPS: 0');
    expect(currentCompositionField!.value).toContain('🏹 Ranged DPS: 0');
  });
});
