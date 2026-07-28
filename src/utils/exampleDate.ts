/**
 * Builds an example date for command samples shown to users (welcome embed, help
 * texts, error hints).
 *
 * Why generate this at runtime instead of hardcoding a date: `/raid create`
 * rejects any date in the past ("Raid date must be in the future!", see
 * src/commands/raid.ts). A hardcoded example date silently expires and turns
 * every copy-paste sample into a guaranteed error for new users.
 *
 * Parameters:
 *   - daysAhead: number - How many days into the future the example lies (default 7)
 *   - now: Date - Reference point, injectable so tests do not need fake timers
 *
 * Returns:
 *   string - The date as `YYYY-MM-DD`, built from UTC components so the result
 *            is locale- and host-timezone-independent (and therefore testable)
 *
 * Example:
 *   const date = exampleRaidDate(7, new Date('2026-07-28T00:00:00Z')); // '2026-08-04'
 */
export function exampleRaidDate(daysAhead = 7, now: Date = new Date()): string {
  const target = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, '0');
  const day = String(target.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
