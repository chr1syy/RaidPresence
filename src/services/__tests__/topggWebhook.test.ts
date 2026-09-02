jest.mock('../../database/client');

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import prisma from '../../database/client';
import {
  createVoteWebhookApp,
  isVoteWebhookEnabled,
  recordVote,
  startVoteWebhook,
  webhookPort,
  VOTE_WEBHOOK_PATH,
} from '../topggWebhook';

const SECRET = 'super-secret-authorization-value';

/** A realistic Top.gg bot-vote payload. */
const votePayload = (overrides: Record<string, unknown> = {}) => ({
  bot: 'bot-123',
  user: 'user-456',
  type: 'upvote',
  isWeekend: false,
  ...overrides,
});

describe('topggWebhook', () => {
  const ORIGINAL_SECRET = process.env.TOPGG_WEBHOOK_SECRET;
  const ORIGINAL_PORT = process.env.TOPGG_WEBHOOK_PORT;
  let logSpy: any;
  let errorSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    delete process.env.TOPGG_WEBHOOK_SECRET;
    delete process.env.TOPGG_WEBHOOK_PORT;
    (prisma.topggVote.create as jest.Mock).mockResolvedValue({} as any);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    if (ORIGINAL_SECRET === undefined) delete process.env.TOPGG_WEBHOOK_SECRET;
    else process.env.TOPGG_WEBHOOK_SECRET = ORIGINAL_SECRET;
    if (ORIGINAL_PORT === undefined) delete process.env.TOPGG_WEBHOOK_PORT;
    else process.env.TOPGG_WEBHOOK_PORT = ORIGINAL_PORT;
  });

  describe('env gating', () => {
    it('is disabled when no secret is set', () => {
      expect(isVoteWebhookEnabled()).toBe(false);
    });

    it('treats a blank secret as unset', () => {
      process.env.TOPGG_WEBHOOK_SECRET = '   ';
      expect(isVoteWebhookEnabled()).toBe(false);
    });

    it('startVoteWebhook opens no port without a secret', () => {
      expect(startVoteWebhook()).toBeNull();
      expect(logSpy).toHaveBeenCalledWith(
        'ℹ️ Top.gg: TOPGG_WEBHOOK_SECRET is not set — the vote webhook is disabled',
      );
    });

    it('rejects every request when no secret is configured, even an empty auth header', async () => {
      // Guards against the classic bug where an unset secret makes everything authorized.
      const app = createVoteWebhookApp();

      await request(app).post(VOTE_WEBHOOK_PATH).send(votePayload()).expect(401);
      await request(app)
        .post(VOTE_WEBHOOK_PATH)
        .set('Authorization', '')
        .send(votePayload())
        .expect(401);

      expect(prisma.topggVote.create).not.toHaveBeenCalled();
    });
  });

  describe('port selection', () => {
    it('defaults to 8080', () => {
      expect(webhookPort()).toBe(8080);
    });

    it('honours TOPGG_WEBHOOK_PORT', () => {
      process.env.TOPGG_WEBHOOK_PORT = '9001';
      expect(webhookPort()).toBe(9001);
    });

    it('falls back to the default on an unusable value', () => {
      process.env.TOPGG_WEBHOOK_PORT = 'not-a-port';
      expect(webhookPort()).toBe(8080);

      process.env.TOPGG_WEBHOOK_PORT = '99999';
      expect(webhookPort()).toBe(8080);
    });
  });

  describe('authorization', () => {
    beforeEach(() => {
      process.env.TOPGG_WEBHOOK_SECRET = SECRET;
    });

    it('accepts a request carrying the exact secret', async () => {
      await request(createVoteWebhookApp())
        .post(VOTE_WEBHOOK_PATH)
        .set('Authorization', SECRET)
        .send(votePayload())
        .expect(204);

      expect(prisma.topggVote.create).toHaveBeenCalledTimes(1);
    });

    it('rejects a missing header', async () => {
      await request(createVoteWebhookApp())
        .post(VOTE_WEBHOOK_PATH)
        .send(votePayload())
        .expect(401);

      expect(prisma.topggVote.create).not.toHaveBeenCalled();
    });

    it('rejects a wrong secret of the same length', async () => {
      const sameLengthWrong = 'x'.repeat(SECRET.length);
      expect(sameLengthWrong.length).toBe(SECRET.length);

      await request(createVoteWebhookApp())
        .post(VOTE_WEBHOOK_PATH)
        .set('Authorization', sameLengthWrong)
        .send(votePayload())
        .expect(401);

      expect(prisma.topggVote.create).not.toHaveBeenCalled();
    });

    it('rejects a secret that is merely a prefix of the real one', async () => {
      await request(createVoteWebhookApp())
        .post(VOTE_WEBHOOK_PATH)
        .set('Authorization', SECRET.slice(0, -1))
        .send(votePayload())
        .expect(401);

      expect(prisma.topggVote.create).not.toHaveBeenCalled();
    });

    it('never echoes the supplied or expected secret into the log', async () => {
      await request(createVoteWebhookApp())
        .post(VOTE_WEBHOOK_PATH)
        .set('Authorization', 'guessed-value')
        .send(votePayload())
        .expect(401);

      const logged = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map(String)
        .join(' ');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('guessed-value');
    });
  });

  describe('payload handling', () => {
    beforeEach(() => {
      process.env.TOPGG_WEBHOOK_SECRET = SECRET;
    });

    const post = (body: unknown) =>
      request(createVoteWebhookApp())
        .post(VOTE_WEBHOOK_PATH)
        .set('Authorization', SECRET)
        .send(body as any);

    it('persists the vote fields', async () => {
      await post(votePayload({ isWeekend: true, query: 'ref=discord' })).expect(204);

      expect(prisma.topggVote.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-456',
          botId: 'bot-123',
          type: 'upvote',
          isWeekend: true,
          query: 'ref=discord',
        },
      });
    });

    it('records a dashboard test delivery as type "test" rather than dropping it', async () => {
      await post(votePayload({ type: 'test' })).expect(204);

      expect(prisma.topggVote.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'test' }) }),
      );
    });

    it('defaults isWeekend and query when absent', async () => {
      await post({ bot: 'bot-123', user: 'user-456', type: 'upvote' }).expect(204);

      expect(prisma.topggVote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isWeekend: false, query: null }),
      });
    });

    it('rejects a payload with no user as 400 so Top.gg does not retry it', async () => {
      await post({ bot: 'bot-123', type: 'upvote' }).expect(400);
      expect(prisma.topggVote.create).not.toHaveBeenCalled();
    });

    it('rejects a payload with no type as 400', async () => {
      await post({ bot: 'bot-123', user: 'user-456' }).expect(400);
      expect(prisma.topggVote.create).not.toHaveBeenCalled();
    });

    it('returns 500 on a persistence failure so Top.gg retries a real vote', async () => {
      (prisma.topggVote.create as jest.Mock).mockRejectedValue(new Error('db down') as never);

      await post(votePayload()).expect(500);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('routing', () => {
    beforeEach(() => {
      process.env.TOPGG_WEBHOOK_SECRET = SECRET;
    });

    it('exposes nothing else on the port', async () => {
      const app = createVoteWebhookApp();

      await request(app).get('/').expect(404);
      await request(app).get(VOTE_WEBHOOK_PATH).expect(404);
      await request(app).post('/anything-else').set('Authorization', SECRET).expect(404);
    });
  });

  describe('recordVote', () => {
    it('writes a row without going through HTTP', async () => {
      await recordVote({ bot: 'b', user: 'u', type: 'upvote', isWeekend: false });

      expect(prisma.topggVote.create).toHaveBeenCalledWith({
        data: { userId: 'u', botId: 'b', type: 'upvote', isWeekend: false, query: null },
      });
    });
  });
});
