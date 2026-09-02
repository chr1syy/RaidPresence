import { timingSafeEqual } from 'node:crypto';
import express, { Express, Request, Response } from 'express';
import type { Server } from 'node:http';
import prisma from '../database/client';

/**
 * Top.gg vote webhook.
 *
 * Top.gg only exposes a rolling 12-hour "has this user voted" check, so vote history is
 * ours to keep or lose. Each delivery is persisted as a `TopggVote` row, which is what
 * makes votes rewardable and measurable later.
 *
 * Entirely env-gated on `TOPGG_WEBHOOK_SECRET`. Without it this module logs one
 * informational line at startup and never opens a port. A bot running without the secret
 * behaves exactly as it does today — no listener, no exposed surface.
 */

/** Path Top.gg is configured to POST to. */
export const VOTE_WEBHOOK_PATH = '/topgg/vote';

const DEFAULT_PORT = 8080;

/** Bodies are a few hundred bytes; anything larger is not a Top.gg vote. */
const MAX_BODY_BYTES = '16kb';

/** Read fresh on each call so dotenv load order and tests stay predictable. */
function getSecret(): string | undefined {
  const secret = process.env.TOPGG_WEBHOOK_SECRET?.trim();
  return secret ? secret : undefined;
}

/** Whether the vote webhook is configured. */
export function isVoteWebhookEnabled(): boolean {
  return getSecret() !== undefined;
}

export function webhookPort(): number {
  const raw = process.env.TOPGG_WEBHOOK_PORT;
  if (!raw) return DEFAULT_PORT;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`⚠️ Top.gg: invalid TOPGG_WEBHOOK_PORT "${raw}", falling back to ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return parsed;
}

/**
 * Constant-time comparison of the request's Authorization header against the secret.
 *
 * `timingSafeEqual` throws on length mismatch, and comparing lengths first would itself
 * leak the secret's length, so both sides are hashed to a fixed width before comparison.
 * Length is compared separately and non-fatally — an attacker learning only that the
 * lengths differ gains nothing they could not get by trying one guess.
 */
function isAuthorized(header: unknown): boolean {
  const secret = getSecret();
  if (!secret) return false;
  if (typeof header !== 'string' || header.length === 0) return false;

  const provided = Buffer.from(header, 'utf8');
  const expected = Buffer.from(secret, 'utf8');

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** The subset of Top.gg's bot-vote payload that is persisted. */
export interface TopggVotePayload {
  bot: string;
  user: string;
  type: string;
  isWeekend?: boolean;
  query?: string;
}

/**
 * Validates the payload shape.
 *
 * `user` and `type` are the only fields required to make a row meaningful. `bot` is
 * expected but tolerated as empty, since a missing bot id in a correctly authenticated
 * delivery is Top.gg's problem, not a reason to drop a real vote on the floor.
 */
function parsePayload(body: unknown): TopggVotePayload | null {
  if (typeof body !== 'object' || body === null) return null;

  const candidate = body as Record<string, unknown>;
  if (typeof candidate.user !== 'string' || candidate.user.length === 0) return null;
  if (typeof candidate.type !== 'string' || candidate.type.length === 0) return null;

  return {
    bot: typeof candidate.bot === 'string' ? candidate.bot : '',
    user: candidate.user,
    type: candidate.type,
    isWeekend: candidate.isWeekend === true,
    query: typeof candidate.query === 'string' && candidate.query.length > 0 ? candidate.query : undefined,
  };
}

/** Persists one vote. Exported so the recording rule is testable without HTTP. */
export async function recordVote(payload: TopggVotePayload): Promise<void> {
  await prisma.topggVote.create({
    data: {
      userId: payload.user,
      botId: payload.bot,
      type: payload.type,
      isWeekend: payload.isWeekend ?? false,
      query: payload.query ?? null,
    },
  });
}

/**
 * Builds the Express app.
 *
 * Exported separately from {@link startVoteWebhook} so tests can drive the routes
 * without binding a port.
 */
export function createVoteWebhookApp(): Express {
  const app = express();

  // Only this route parses JSON, and only within a small cap — the process should not
  // grow a general-purpose body parser just because one endpoint needs one.
  app.post(VOTE_WEBHOOK_PATH, express.json({ limit: MAX_BODY_BYTES }), async (req: Request, res: Response) => {
    if (!isAuthorized(req.headers.authorization)) {
      // No detail in the response and no echo of the supplied value into the log: an
      // unauthenticated caller learns only that it was rejected.
      console.warn('⚠️ Top.gg: rejected a vote webhook with a bad authorization header');
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const payload = parsePayload(req.body);
    if (!payload) {
      // 400, not 500: a malformed body will never become valid, so Top.gg should not
      // retry it.
      console.warn('⚠️ Top.gg: rejected a vote webhook with a malformed payload');
      res.status(400).json({ error: 'malformed payload' });
      return;
    }

    try {
      await recordVote(payload);
    } catch (error) {
      // 500 so Top.gg retries: the vote was real and the failure is on our side.
      console.error('❌ Top.gg: failed to persist a vote:', error);
      res.status(500).json({ error: 'could not record vote' });
      return;
    }

    console.log(
      `🗳️ Top.gg: recorded ${payload.type} from user ${payload.user}${payload.isWeekend ? ' (weekend, counts double)' : ''}`,
    );
    res.status(204).end();
  });

  // Anything else on this port is not part of the contract.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not found' });
  });

  return app;
}

/**
 * Starts the vote webhook listener, if a secret is configured.
 *
 * Returns the HTTP server, or null if it stayed inert for lack of a secret.
 */
export function startVoteWebhook(): Server | null {
  if (!isVoteWebhookEnabled()) {
    console.log('ℹ️ Top.gg: TOPGG_WEBHOOK_SECRET is not set — the vote webhook is disabled');
    return null;
  }

  const port = webhookPort();
  const server = createVoteWebhookApp().listen(port, () => {
    console.log(`✅ Top.gg: vote webhook listening on port ${port} at ${VOTE_WEBHOOK_PATH}`);
  });

  // A port collision must not take the bot down with it — Discord functionality does not
  // depend on this listener.
  server.on('error', (error) => {
    console.error('❌ Top.gg: vote webhook server error:', error);
  });

  return server;
}
