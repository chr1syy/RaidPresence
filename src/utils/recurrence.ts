/**
 * Recurrence constants, kept dependency-free.
 *
 * They live here rather than in `services/recurringRaidService` so that
 * `commands/raid` can name them without pulling in the service — the service imports
 * `createRaidEmbed`/`parseRoleInput` from that command module, and a static cycle
 * between the two is exactly the kind of load-order trap that only shows up in prod.
 */

/** The only recurrence rule that exists today. Stored as text so daily/biweekly can follow. */
export const RECURRENCE_WEEKLY = 'weekly';

/**
 * Consecutive auto-generated raids with zero player interaction before the series pauses.
 *
 * Three is the point where "quiet week" stops being a plausible explanation. With a
 * measured 59% of installs already dead, an unbounded series would keep posting into
 * empty channels forever — which is the difference between a retention feature and a
 * spam machine.
 */
export const ZOMBIE_PAUSE_AFTER = 3;

/** Nudge buttons stop working after this long; the scheduler strips them. */
export const NUDGE_TTL_MS = 48 * 60 * 60 * 1000;

/** Only raids that ended this recently get a nudge — bounds the first run after deploy. */
export const NUDGE_LOOKBACK_MS = 6 * 60 * 60 * 1000;
