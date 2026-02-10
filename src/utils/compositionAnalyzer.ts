import { getSpecRole, getSpecsForClass, WoWRole, RoleComposition } from './wowData';
import { getRoleFlexibility } from './attendanceAnalytics';

/**
 * Minimal attendance record shape for composition analysis.
 */
export interface CompositionAttendee {
  userId: string;
  username: string;
  status: string; // 'attending' | 'opted_out' | 'late'
  wowClass: string | null;
  wowSpec: string | null;
}

/**
 * Optimal composition target for a given raid size.
 */
export interface OptimalComposition {
  tanks: number;
  healers: number;
  melee: number;
  ranged: number;
  totalDps: number;
  raidSize: number;
}

/**
 * Status flag for composition readiness.
 */
export type CompositionStatus = 'READY' | 'NEEDS_TANKS' | 'NEEDS_HEALERS' | 'NEEDS_DPS'
  | 'OVERSTOCKED_TANKS' | 'OVERSTOCKED_HEALERS' | 'OVERSTOCKED_DPS';

/**
 * Result of analyzeRaidComposition().
 */
export interface CompositionAnalysis {
  current: RoleComposition;
  optimal: OptimalComposition;
  activePlayers: number;
  statusFlags: CompositionStatus[];
}

/**
 * A single gap entry identifying a role shortfall or overage.
 */
export interface CompositionGap {
  role: 'Tank' | 'Healer' | 'DPS';
  needed: number;
  current: number;
  difference: number; // positive = surplus, negative = shortfall
}

/**
 * Result of findCompositionGaps().
 */
export interface GapAnalysis {
  gaps: CompositionGap[];
  hasGaps: boolean;
  hasOverages: boolean;
}

/**
 * A player suggestion for filling a composition gap.
 */
export interface PlayerSuggestion {
  userId: string;
  username: string;
  currentClass: string | null;
  currentSpec: string | null;
  suggestedRole: WoWRole;
  canFillRoles: WoWRole[];
  flexibilityScore: number; // 0-100
}

/**
 * Result of suggestPlayerSwaps().
 */
export interface SwapSuggestions {
  suggestions: PlayerSuggestion[];
  unfilledRoles: CompositionGap[];
}

/**
 * Result of calculateSuccessLikelihood().
 */
export interface SuccessLikelihood {
  percentage: number; // 0-100
  label: string;
  factors: string[];
}

// --- Optimal Composition Tables ---

/**
 * Get the optimal composition for a given raid size.
 * Based on standard WoW raid composition guidelines:
 * - 10-man: 2 tanks, 2-3 healers, 5-6 DPS
 * - 20-man (Mythic): 2 tanks, 4-5 healers, 13-14 DPS
 * - Flex (11-19): scales linearly
 *
 * @param raidSize - Total number of players
 * @returns OptimalComposition with role targets
 */
export function getOptimalComposition(raidSize: number): OptimalComposition {
  if (raidSize <= 0) {
    return { tanks: 0, healers: 0, melee: 0, ranged: 0, totalDps: 0, raidSize: 0 };
  }

  // Tanks: always 2 for any meaningful raid
  const tanks = raidSize <= 5 ? 1 : 2;

  // Healers: roughly 1 per 5 players, minimum 1
  const healers = Math.max(1, Math.round(raidSize / 5));

  const totalDps = Math.max(0, raidSize - tanks - healers);

  // Ideal melee/ranged split is roughly 40/60
  const melee = Math.round(totalDps * 0.4);
  const ranged = totalDps - melee;

  return { tanks, healers, melee, ranged, totalDps, raidSize };
}

/**
 * Analyze the current raid composition against optimal targets.
 *
 * @param attendance - Array of attendance records for the raid
 * @returns CompositionAnalysis with current counts, optimal targets, and status flags
 */
export function analyzeRaidComposition(attendance: CompositionAttendee[]): CompositionAnalysis {
  // Active players = attending + late
  const activePlayers = attendance.filter(
    (a) => a.status === 'attending' || a.status === 'late',
  );

  const current = calculateComposition(activePlayers);
  const optimal = getOptimalComposition(activePlayers.length);
  const statusFlags = determineStatusFlags(current, optimal);

  return {
    current,
    optimal,
    activePlayers: activePlayers.length,
    statusFlags,
  };
}

/**
 * Identify composition gaps (shortfalls and overages).
 *
 * @param attendance - Array of attendance records for the raid
 * @returns GapAnalysis with specific role gaps
 */
export function findCompositionGaps(attendance: CompositionAttendee[]): GapAnalysis {
  const activePlayers = attendance.filter(
    (a) => a.status === 'attending' || a.status === 'late',
  );

  const current = calculateComposition(activePlayers);
  const optimal = getOptimalComposition(activePlayers.length);

  const gaps: CompositionGap[] = [
    {
      role: 'Tank',
      needed: optimal.tanks,
      current: current.tanks,
      difference: current.tanks - optimal.tanks,
    },
    {
      role: 'Healer',
      needed: optimal.healers,
      current: current.healers,
      difference: current.healers - optimal.healers,
    },
    {
      role: 'DPS',
      needed: optimal.totalDps,
      current: current.melee + current.ranged,
      difference: (current.melee + current.ranged) - optimal.totalDps,
    },
  ];

  const hasGaps = gaps.some((g) => g.difference < 0);
  const hasOverages = gaps.some((g) => g.difference > 0);

  return { gaps, hasGaps, hasOverages };
}

/**
 * Suggest players who could switch roles or be recruited to fill composition gaps.
 * Looks at opted-out players and those without a class set for potential role fills.
 *
 * @param attendance - Full attendance list (all statuses)
 * @param gaps - Gap analysis result from findCompositionGaps()
 * @returns SwapSuggestions with ranked player suggestions per gap
 */
export function suggestPlayerSwaps(
  attendance: CompositionAttendee[],
  gaps: GapAnalysis,
): SwapSuggestions {
  // Only suggest for roles that are short-staffed
  const shortfalls = gaps.gaps.filter((g) => g.difference < 0);

  if (shortfalls.length === 0) {
    return { suggestions: [], unfilledRoles: [] };
  }

  const optedOut = attendance.filter((a) => a.status === 'opted_out');
  const suggestions: PlayerSuggestion[] = [];
  const neededRoles = new Set<WoWRole>();

  for (const gap of shortfalls) {
    if (gap.role === 'Tank') neededRoles.add('Tank');
    else if (gap.role === 'Healer') neededRoles.add('Healer');
    else {
      neededRoles.add('Melee');
      neededRoles.add('Ranged');
    }
  }

  for (const player of optedOut) {
    if (!player.wowClass) continue;

    const possibleRoles = getRoleFlexibility(player.wowClass);
    const matchingRoles = possibleRoles.filter((r) => neededRoles.has(r));

    if (matchingRoles.length > 0) {
      const flexibilityScore = Math.min(100, Math.round((possibleRoles.length / 4) * 100));

      for (const suggestedRole of matchingRoles) {
        suggestions.push({
          userId: player.userId,
          username: player.username,
          currentClass: player.wowClass,
          currentSpec: player.wowSpec,
          suggestedRole,
          canFillRoles: possibleRoles,
          flexibilityScore,
        });
      }
    }
  }

  // Sort by flexibility score descending (more flexible players first)
  suggestions.sort((a, b) => b.flexibilityScore - a.flexibilityScore);

  // Deduplicate by userId (keep highest flexibility entry)
  const seen = new Set<string>();
  const deduped = suggestions.filter((s) => {
    const key = `${s.userId}-${s.suggestedRole}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Determine which gaps are still unfilled (no suggestions found)
  const suggestedRoles = new Set(deduped.map((s) => s.suggestedRole));
  const unfilledRoles = shortfalls.filter((gap) => {
    if (gap.role === 'Tank') return !suggestedRoles.has('Tank');
    if (gap.role === 'Healer') return !suggestedRoles.has('Healer');
    return !suggestedRoles.has('Melee') && !suggestedRoles.has('Ranged');
  });

  return { suggestions: deduped, unfilledRoles };
}

/**
 * Calculate a rough success likelihood based on composition.
 * Factors: role coverage, total player count, class set percentage.
 *
 * @param attendance - Array of attendance records for the raid
 * @returns SuccessLikelihood with percentage, label, and factor explanations
 */
export function calculateSuccessLikelihood(attendance: CompositionAttendee[]): SuccessLikelihood {
  const activePlayers = attendance.filter(
    (a) => a.status === 'attending' || a.status === 'late',
  );

  if (activePlayers.length === 0) {
    return { percentage: 0, label: 'No Players', factors: ['No active players signed up'] };
  }

  const current = calculateComposition(activePlayers);
  const optimal = getOptimalComposition(activePlayers.length);
  const factors: string[] = [];
  let score = 100;

  // Factor 1: Tank coverage (30% weight)
  if (optimal.tanks > 0) {
    const tankRatio = Math.min(current.tanks / optimal.tanks, 1);
    const tankPenalty = Math.round((1 - tankRatio) * 30);
    score -= tankPenalty;
    if (tankPenalty > 0) {
      factors.push(`Missing ${optimal.tanks - current.tanks} tank(s)`);
    }
  }

  // Factor 2: Healer coverage (30% weight)
  if (optimal.healers > 0) {
    const healerRatio = Math.min(current.healers / optimal.healers, 1);
    const healerPenalty = Math.round((1 - healerRatio) * 30);
    score -= healerPenalty;
    if (healerPenalty > 0) {
      factors.push(`Missing ${optimal.healers - current.healers} healer(s)`);
    }
  }

  // Factor 3: DPS coverage (20% weight)
  const currentDps = current.melee + current.ranged;
  if (optimal.totalDps > 0) {
    const dpsRatio = Math.min(currentDps / optimal.totalDps, 1);
    const dpsPenalty = Math.round((1 - dpsRatio) * 20);
    score -= dpsPenalty;
    if (dpsPenalty > 0) {
      factors.push(`Missing ${optimal.totalDps - currentDps} DPS`);
    }
  }

  // Factor 4: Class/spec set percentage (10% weight)
  const classSetCount = activePlayers.filter((a) => a.wowClass && a.wowSpec).length;
  const classSetRatio = activePlayers.length > 0 ? classSetCount / activePlayers.length : 0;
  const classSetPenalty = Math.round((1 - classSetRatio) * 10);
  score -= classSetPenalty;
  if (current.noClass > 0) {
    factors.push(`${current.noClass} player(s) without class/spec set`);
  }

  // Factor 5: Minimum viable raid size (10% weight)
  if (activePlayers.length < 10) {
    const sizePenalty = Math.round(((10 - activePlayers.length) / 10) * 10);
    score -= sizePenalty;
    factors.push(`Only ${activePlayers.length} players (10 recommended minimum)`);
  }

  score = Math.max(0, Math.min(100, score));

  if (factors.length === 0) {
    factors.push('Composition looks good');
  }

  const label = getSuccessLabel(score);

  return { percentage: score, label, factors };
}

// --- Internal Helpers ---

/**
 * Calculate role composition from a list of attendees.
 */
export function calculateComposition(attendees: CompositionAttendee[]): RoleComposition {
  const composition: RoleComposition = {
    tanks: 0,
    healers: 0,
    melee: 0,
    ranged: 0,
    noClass: 0,
  };

  for (const attendee of attendees) {
    const role = getSpecRole(attendee.wowClass, attendee.wowSpec);
    if (role === 'Tank') composition.tanks++;
    else if (role === 'Healer') composition.healers++;
    else if (role === 'Melee') composition.melee++;
    else if (role === 'Ranged') composition.ranged++;
    else composition.noClass++;
  }

  return composition;
}

/**
 * Determine status flags based on current vs optimal composition.
 */
function determineStatusFlags(
  current: RoleComposition,
  optimal: OptimalComposition,
): CompositionStatus[] {
  const flags: CompositionStatus[] = [];

  if (current.tanks < optimal.tanks) flags.push('NEEDS_TANKS');
  if (current.healers < optimal.healers) flags.push('NEEDS_HEALERS');

  const currentDps = current.melee + current.ranged;
  if (currentDps < optimal.totalDps) flags.push('NEEDS_DPS');

  if (current.tanks > optimal.tanks) flags.push('OVERSTOCKED_TANKS');
  if (current.healers > optimal.healers) flags.push('OVERSTOCKED_HEALERS');
  if (currentDps > optimal.totalDps) flags.push('OVERSTOCKED_DPS');

  if (flags.length === 0) flags.push('READY');

  return flags;
}

/**
 * Get a human-readable success label from a percentage.
 */
function getSuccessLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 25) return 'Poor';
  return 'Critical';
}
