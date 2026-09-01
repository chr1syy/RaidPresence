import { Client } from 'discord.js';

/**
 * Top.gg server-count posting.
 *
 * RaidPresence is listed on Top.gg, but nothing has ever posted a server count, so the
 * listing shows 0 servers. Top.gg ranks and filters by that number, so a zero costs
 * placement and click-through directly.
 *
 * Entirely env-gated on `TOPGG_TOKEN`. Without it this module logs one informational
 * line at startup and stays completely inert — no timer, no request, no retry. A bot
 * running without the token behaves exactly as it does today.
 */

const TOPGG_API_BASE = 'https://top.gg/api';

/** Top.gg's guidance is "every 30 minutes"; the count barely moves at this install base. */
export const STATS_POST_INTERVAL_MS = 30 * 60 * 1000;

/** Reads the token fresh on each call so tests and dotenv load order stay predictable. */
function getToken(): string | undefined {
  const token = process.env.TOPGG_TOKEN?.trim();
  return token ? token : undefined;
}

/** Whether server-count posting is configured. */
export function isStatsPostingEnabled(): boolean {
  return getToken() !== undefined;
}

/**
 * Number of guilds to report to Top.gg.
 *
 * Deliberately the gateway cache, not the database. The `Guild` table keeps a row per
 * guild that ever installed the bot — 135 rows against 56 live installs — because rows
 * are retained on departure and only marked with `leftAt`. Even `leftAt IS NULL` is a
 * derived approximation maintained by the lifecycle handlers, whereas the cache *is* the
 * set of guilds the gateway currently has us in. Reporting anything larger would be
 * inflating the listing.
 */
export function currentServerCount(client: Client): number {
  return client.guilds.cache.size;
}

/**
 * Posts the current server count to Top.gg once.
 *
 * Returns true when Top.gg accepted the post, false on any failure or when posting is
 * not configured. Never throws: this is best-effort telemetry to a third party and must
 * not be able to disturb the bot.
 */
export async function postServerCount(client: Client): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  const botId = client.user?.id;
  if (!botId) {
    console.warn('⚠️ Top.gg: cannot post server count, the client is not logged in yet');
    return false;
  }

  const serverCount = currentServerCount(client);

  try {
    const response = await fetch(`${TOPGG_API_BASE}/bots/${botId}/stats`, {
      method: 'POST',
      headers: {
        // The token is a credential: it goes in this header and is never logged, not
        // even truncated, and never included in an error message below.
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ server_count: serverCount }),
    });

    if (!response.ok) {
      console.error(`❌ Top.gg: server count post rejected with HTTP ${response.status}`);
      return false;
    }

    console.log(`📈 Top.gg: posted server count = ${serverCount}`);
    return true;
  } catch (error) {
    console.error('❌ Top.gg: server count post failed:', error);
    return false;
  }
}

/**
 * Starts the periodic server-count poster, if a token is configured.
 *
 * Posts once immediately so a restart refreshes the listing right away, then every
 * {@link STATS_POST_INTERVAL_MS}. A failed post is logged and simply retried on the next
 * tick — there is no inner retry loop on purpose, since the next attempt is already
 * scheduled and hammering a third-party API on failure is how rate limits are earned.
 *
 * Returns true if the poster was started, false if it stayed inert for lack of a token.
 */
export function startTopggStatsPoster(client: Client): boolean {
  if (!isStatsPostingEnabled()) {
    console.log('ℹ️ Top.gg: TOPGG_TOKEN is not set — server count posting is disabled');
    return false;
  }

  // Fire-and-forget: postServerCount() resolves rather than rejects on failure, so this
  // cannot produce an unhandled rejection.
  void postServerCount(client);
  setInterval(() => {
    void postServerCount(client);
  }, STATS_POST_INTERVAL_MS);

  console.log('✅ Top.gg: server count posting started - every 30 minutes');
  return true;
}
