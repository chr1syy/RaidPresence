import {
  CompositionAttendee,
  analyzeRaidComposition,
  getOptimalComposition,
  findCompositionGaps,
  suggestPlayerSwaps,
  calculateSuccessLikelihood,
  calculateComposition,
} from '../compositionAnalyzer';

// Helper to create attendee records
function makeAttendee(overrides: Partial<CompositionAttendee> = {}): CompositionAttendee {
  return {
    userId: 'user-1',
    username: 'Player1',
    status: 'attending',
    wowClass: null,
    wowSpec: null,
    ...overrides,
  };
}

describe('getOptimalComposition()', () => {
  it('should return 0s for 0 raid size', () => {
    const optimal = getOptimalComposition(0);
    expect(optimal.tanks).toBe(0);
    expect(optimal.healers).toBe(0);
    expect(optimal.totalDps).toBe(0);
  });

  it('should return 1 tank for small raids (1-5 players)', () => {
    for (let size = 1; size <= 5; size++) {
      const optimal = getOptimalComposition(size);
      expect(optimal.tanks).toBe(1);
    }
  });

  it('should return 2 tanks for raids >5 players', () => {
    for (let size = 6; size <= 20; size++) {
      const optimal = getOptimalComposition(size);
      expect(optimal.tanks).toBe(2);
    }
  });

  it('should scale healers roughly 1 per 5 players', () => {
    expect(getOptimalComposition(10).healers).toBe(2);
    expect(getOptimalComposition(15).healers).toBe(3);
    expect(getOptimalComposition(20).healers).toBe(4);
  });

  it('should maintain roughly 40% melee, 60% ranged DPS split', () => {
    const comp = getOptimalComposition(20);
    const totalDps = comp.melee + comp.ranged;
    expect(totalDps).toBe(14);
    // 40% of 14 = 5.6 ≈ 6 melee, 8 ranged
    expect(comp.melee).toBe(6);
    expect(comp.ranged).toBe(8);
  });

  it('should have totalDps = raidSize - tanks - healers', () => {
    const comp = getOptimalComposition(15);
    expect(comp.totalDps).toBe(15 - comp.tanks - comp.healers);
  });
});

describe('calculateComposition()', () => {
  it('should correctly count roles from attendees', () => {
    const attendees: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
    ];

    const comp = calculateComposition(attendees);
    expect(comp.tanks).toBe(1);
    expect(comp.healers).toBe(1);
    expect(comp.melee).toBe(1);
    expect(comp.ranged).toBe(1);
    expect(comp.noClass).toBe(0);
  });

  it('should count players without class/spec as noClass', () => {
    const attendees: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: null, wowSpec: null, status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Warrior', wowSpec: null, status: 'attending' }),
    ];

    const comp = calculateComposition(attendees);
    expect(comp.noClass).toBe(2);
  });

  it('should handle empty attendee list', () => {
    const comp = calculateComposition([]);
    expect(comp.tanks).toBe(0);
    expect(comp.healers).toBe(0);
    expect(comp.melee).toBe(0);
    expect(comp.ranged).toBe(0);
    expect(comp.noClass).toBe(0);
  });

  it('should handle multiple healers correctly', () => {
    const attendees: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Druid', wowSpec: 'Restoration', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Paladin', wowSpec: 'Holy', status: 'attending' }),
    ];

    const comp = calculateComposition(attendees);
    expect(comp.healers).toBe(3);
  });
});

describe('analyzeRaidComposition()', () => {
  it('should analyze a well-balanced raid', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Druid', wowSpec: 'Restoration', status: 'attending' }),
      makeAttendee({ userId: 'u5', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u6', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
      makeAttendee({ userId: 'u7', wowClass: 'Hunter', wowSpec: 'Marksmanship', status: 'attending' }),
      makeAttendee({ userId: 'u8', wowClass: 'Warlock', wowSpec: 'Destruction', status: 'attending' }),
      makeAttendee({ userId: 'u9', wowClass: 'Demon Hunter', wowSpec: 'Havoc', status: 'attending' }),
      makeAttendee({ userId: 'u10', wowClass: 'Death Knight', wowSpec: 'Unholy', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendance);
    expect(analysis.activePlayers).toBe(10);
    expect(analysis.current.tanks).toBe(2);
    expect(analysis.current.healers).toBe(2);
    expect(analysis.current.melee).toBe(3); // Rogue, DH, DK are melee
    expect(analysis.current.ranged).toBe(3); // Mage, Hunter, Warlock are ranged
    expect(analysis.statusFlags).toContain('READY');
  });

  it('should identify missing tanks', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendance);
    expect(analysis.statusFlags).toContain('NEEDS_TANKS');
  });

  it('should identify missing healers', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendance);
    expect(analysis.statusFlags).toContain('NEEDS_HEALERS');
  });

  it('should identify overstocked roles', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Demon Hunter', wowSpec: 'Vengeance', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Monk', wowSpec: 'Brewmaster', status: 'attending' }),
      makeAttendee({ userId: 'u5', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
    ];

    const analysis = analyzeRaidComposition(attendance);
    expect(analysis.statusFlags).toContain('OVERSTOCKED_TANKS');
  });

  it('should exclude opted_out players from active count', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Mage', wowSpec: 'Fire', status: 'opted_out' }),
    ];

    const analysis = analyzeRaidComposition(attendance);
    expect(analysis.activePlayers).toBe(2);
  });

  it('should include late players in active count', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Priest', wowSpec: 'Holy', status: 'late' }),
    ];

    const analysis = analyzeRaidComposition(attendance);
    expect(analysis.activePlayers).toBe(2);
  });

  it('should handle empty attendance', () => {
    const analysis = analyzeRaidComposition([]);
    expect(analysis.activePlayers).toBe(0);
    expect(analysis.current.tanks).toBe(0);
    expect(analysis.statusFlags).toContain('READY'); // No gaps = ready
  });
});

describe('findCompositionGaps()', () => {
  it('should identify no gaps for well-composed raid', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Druid', wowSpec: 'Restoration', status: 'attending' }),
      makeAttendee({ userId: 'u5', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u6', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
      makeAttendee({ userId: 'u7', wowClass: 'Hunter', wowSpec: 'Marksmanship', status: 'attending' }),
      makeAttendee({ userId: 'u8', wowClass: 'Warlock', wowSpec: 'Destruction', status: 'attending' }),
      makeAttendee({ userId: 'u9', wowClass: 'Demon Hunter', wowSpec: 'Havoc', status: 'attending' }),
      makeAttendee({ userId: 'u10', wowClass: 'Death Knight', wowSpec: 'Unholy', status: 'attending' }),
    ];

    const gaps = findCompositionGaps(attendance);
    expect(gaps.hasGaps).toBe(false);
    expect(gaps.hasOverages).toBe(false);
    expect(gaps.gaps.every((g) => g.difference >= 0)).toBe(true);
  });

  it('should identify tank shortage', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const gaps = findCompositionGaps(attendance);
    expect(gaps.hasGaps).toBe(true);
    const tankGap = gaps.gaps.find((g) => g.role === 'Tank');
    expect(tankGap).toBeDefined();
    expect(tankGap!.difference).toBeLessThan(0);
  });

  it('should identify healer shortage', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const gaps = findCompositionGaps(attendance);
    expect(gaps.hasGaps).toBe(true);
    const healerGap = gaps.gaps.find((g) => g.role === 'Healer');
    expect(healerGap).toBeDefined();
    expect(healerGap!.difference).toBeLessThan(0);
  });

  it('should identify DPS shortage', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      // 3 people = need 1 tank, 1 healer, 1 dps. We have 2 tanks, 1 healer, 0 dps = gap in DPS
    ];

    const gaps = findCompositionGaps(attendance);
    expect(gaps.hasGaps).toBe(true);
    const dpsGap = gaps.gaps.find((g) => g.role === 'DPS');
    expect(dpsGap).toBeDefined();
    expect(dpsGap!.difference).toBeLessThan(0);
  });

  it('should identify overage in tanks', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Demon Hunter', wowSpec: 'Vengeance', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
    ];

    const gaps = findCompositionGaps(attendance);
    expect(gaps.hasOverages).toBe(true);
    const tankGap = gaps.gaps.find((g) => g.role === 'Tank');
    expect(tankGap!.difference).toBeGreaterThan(0);
  });

  it('should exclude opted_out players from gap analysis', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Mage', wowSpec: 'Fire', status: 'opted_out' }),
    ];

    const gaps = findCompositionGaps(attendance);
    // 2 active players need ~1 tank, 1 healer. We have 1 tank, 1 healer = no gaps
    expect(gaps.hasGaps).toBe(false);
  });
});

describe('suggestPlayerSwaps()', () => {
  it('should suggest healers when healers are needed', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'opted_out' }),
    ];

    const gaps = findCompositionGaps(attendance);
    const suggestions = suggestPlayerSwaps(attendance, gaps);

    expect(suggestions.suggestions.length).toBeGreaterThan(0);
    const healerSuggestions = suggestions.suggestions.filter((s) => s.suggestedRole === 'Healer');
    expect(healerSuggestions.length).toBeGreaterThan(0);
    expect(healerSuggestions.some((s) => s.userId === 'u3')).toBe(true);
  });

  it('should suggest tanks when tanks are needed', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Warrior', wowSpec: 'Protection', status: 'opted_out' }),
    ];

    const gaps = findCompositionGaps(attendance);
    const suggestions = suggestPlayerSwaps(attendance, gaps);

    expect(suggestions.suggestions.length).toBeGreaterThan(0);
    const tankSuggestions = suggestions.suggestions.filter((s) => s.suggestedRole === 'Tank');
    expect(tankSuggestions.length).toBeGreaterThan(0);
  });

  it('should return empty suggestions if no gaps', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const gaps = findCompositionGaps(attendance);
    const suggestions = suggestPlayerSwaps(attendance, gaps);

    expect(suggestions.suggestions.length).toBe(0);
  });

  it('should not suggest players without a class', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: null, wowSpec: null, status: 'opted_out' }),
    ];

    const gaps = findCompositionGaps(attendance);
    const suggestions = suggestPlayerSwaps(attendance, gaps);

    // Should suggest someone, but not u3
    expect(suggestions.suggestions.every((s) => s.userId !== 'u3')).toBe(true);
  });

  it('should suggest only opted-out players, not attending', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'opted_out' }),
    ];

    const gaps = findCompositionGaps(attendance);
    const suggestions = suggestPlayerSwaps(attendance, gaps);

    // All suggestions should be from opted_out players
    expect(suggestions.suggestions.every((s) => s.userId !== 'u1' && s.userId !== 'u2')).toBe(true);
  });

  it('should calculate flexibility score based on possible roles', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      // Druid can be tank, healer, melee, ranged (4 roles) = high flexibility
      makeAttendee({ userId: 'u3', wowClass: 'Druid', wowSpec: 'Balance', status: 'opted_out' }),
    ];

    const gaps = findCompositionGaps(attendance);
    const suggestions = suggestPlayerSwaps(attendance, gaps);

    const druidSuggestion = suggestions.suggestions.find((s) => s.userId === 'u3');
    expect(druidSuggestion).toBeDefined();
    expect(druidSuggestion!.flexibilityScore).toBeGreaterThan(0);
  });
});

describe('calculateSuccessLikelihood()', () => {
  it('should return 0% for no players', () => {
    const likelihood = calculateSuccessLikelihood([]);
    expect(likelihood.percentage).toBe(0);
    expect(likelihood.factors).toContain('No active players signed up');
  });

  it('should return high % for perfect composition', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: 'Druid', wowSpec: 'Restoration', status: 'attending' }),
      makeAttendee({ userId: 'u5', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u6', wowClass: 'Rogue', wowSpec: 'Assassination', status: 'attending' }),
      makeAttendee({ userId: 'u7', wowClass: 'Hunter', wowSpec: 'Marksmanship', status: 'attending' }),
      makeAttendee({ userId: 'u8', wowClass: 'Warlock', wowSpec: 'Destruction', status: 'attending' }),
      makeAttendee({ userId: 'u9', wowClass: 'Demon Hunter', wowSpec: 'Havoc', status: 'attending' }),
      makeAttendee({ userId: 'u10', wowClass: 'Death Knight', wowSpec: 'Unholy', status: 'attending' }),
    ];

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(likelihood.percentage).toBeGreaterThan(75);
  });

  it('should return low % for missing tanks', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(likelihood.percentage).toBeLessThan(70);
    expect(likelihood.factors.some((f) => f.includes('tank'))).toBe(true);
  });

  it('should return low % for missing healers', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
    ];

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(likelihood.percentage).toBeLessThan(70);
    expect(likelihood.factors.some((f) => f.includes('healer'))).toBe(true);
  });

  it('should return low % for players <10', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
    ];

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(likelihood.factors.some((f) => f.includes('recommended minimum'))).toBe(true);
  });

  it('should penalize missing class/spec assignments', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Paladin', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'attending' }),
      makeAttendee({ userId: 'u4', wowClass: null, wowSpec: null, status: 'attending' }),
    ];

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(likelihood.factors.some((f) => f.includes('without class/spec'))).toBe(true);
  });

  it('should exclude opted_out players from calculation', () => {
    const attendance: CompositionAttendee[] = [
      makeAttendee({ userId: 'u1', wowClass: 'Warrior', wowSpec: 'Protection', status: 'attending' }),
      makeAttendee({ userId: 'u2', wowClass: 'Mage', wowSpec: 'Fire', status: 'attending' }),
      makeAttendee({ userId: 'u3', wowClass: 'Priest', wowSpec: 'Holy', status: 'opted_out' }),
    ];

    const likelihood = calculateSuccessLikelihood(attendance);
    // Should only count 2 active players
    expect(likelihood.factors.some((f) => f.includes('2 players'))).toBe(true);
  });

  it('should return label "Good" or higher for high scores', () => {
    const attendance: CompositionAttendee[] = Array.from({ length: 20 }, (_, i) =>
      makeAttendee({
        userId: `u${i}`,
        status: 'attending',
        wowClass: ['Warrior', 'Paladin', 'Priest', 'Druid', 'Mage'][i % 5],
        wowSpec: ['Protection', 'Holy', 'Holy', 'Restoration', 'Fire'][i % 5],
      }),
    );

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(['Good', 'Excellent']).toContain(likelihood.label);
  });

  it('should return label "No Players" for empty attendance', () => {
    const likelihood = calculateSuccessLikelihood([]);
    expect(likelihood.label).toBe('No Players');
  });

  it('should keep percentage between 0-100', () => {
    const attendance: CompositionAttendee[] = Array.from({ length: 50 }, (_, i) =>
      makeAttendee({
        userId: `u${i}`,
        status: 'attending',
        wowClass: 'Warrior',
        wowSpec: 'Protection',
      }),
    );

    const likelihood = calculateSuccessLikelihood(attendance);
    expect(likelihood.percentage).toBeGreaterThanOrEqual(0);
    expect(likelihood.percentage).toBeLessThanOrEqual(100);
  });
});
