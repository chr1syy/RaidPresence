import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  currentServerCount,
  isStatsPostingEnabled,
  postServerCount,
  startTopggStatsPoster,
  STATS_POST_INTERVAL_MS,
} from '../topggService';

/**
 * Minimal client stand-in: the service only reads `user.id` and `guilds.cache.size`.
 * `botId: null` models a client that has not logged in yet (`client.user` undefined).
 */
const makeClient = (guildCount: number, botId: string | null = 'bot-123'): any => ({
  user: botId === null ? undefined : { id: botId },
  guilds: { cache: { size: guildCount } },
});

describe('topggService', () => {
  const ORIGINAL_TOKEN = process.env.TOPGG_TOKEN;
  let fetchMock: any;
  let logSpy: any;
  let errorSpy: any;
  let warnSpy: any;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;

    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    delete process.env.TOPGG_TOKEN;
  });

  afterEach(() => {
    jest.useRealTimers();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    if (ORIGINAL_TOKEN === undefined) delete process.env.TOPGG_TOKEN;
    else process.env.TOPGG_TOKEN = ORIGINAL_TOKEN;
  });

  describe('env gating', () => {
    it('is disabled when TOPGG_TOKEN is unset', () => {
      expect(isStatsPostingEnabled()).toBe(false);
    });

    it('treats a blank token as unset', () => {
      process.env.TOPGG_TOKEN = '   ';
      expect(isStatsPostingEnabled()).toBe(false);
    });

    it('is enabled once a token is present', () => {
      process.env.TOPGG_TOKEN = 'token-abc';
      expect(isStatsPostingEnabled()).toBe(true);
    });

    it('startTopggStatsPoster stays completely inert without a token', () => {
      expect(startTopggStatsPoster(makeClient(56))).toBe(false);

      // No request, and — just as important — no timer, so there is no retry storm.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
      expect(logSpy).toHaveBeenCalledWith(
        'ℹ️ Top.gg: TOPGG_TOKEN is not set — server count posting is disabled',
      );
    });

    it('postServerCount is a no-op without a token', async () => {
      expect(await postServerCount(makeClient(56))).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('currentServerCount', () => {
    it('reports the gateway cache size, not a database count', () => {
      expect(currentServerCount(makeClient(56))).toBe(56);
    });
  });

  describe('postServerCount', () => {
    beforeEach(() => {
      process.env.TOPGG_TOKEN = 'token-abc';
    });

    it('posts server_count to the bot-specific stats endpoint', async () => {
      expect(await postServerCount(makeClient(56))).toBe(true);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://top.gg/api/bots/bot-123/stats',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ server_count: 56 }),
        }),
      );
    });

    it('authenticates with the token in the Authorization header', async () => {
      await postServerCount(makeClient(56));

      const { headers } = fetchMock.mock.calls[0][1] as any;
      expect(headers.Authorization).toBe('token-abc');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('never writes the token to the log', async () => {
      await postServerCount(makeClient(56));

      const logged = [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map(String)
        .join(' ');
      expect(logged).not.toContain('token-abc');
    });

    it('returns false and logs the status when Top.gg rejects the post', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });

      expect(await postServerCount(makeClient(56))).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        '❌ Top.gg: server count post rejected with HTTP 401',
      );
    });

    it('swallows a network failure rather than throwing at the caller', async () => {
      fetchMock.mockRejectedValue(new Error('ENOTFOUND top.gg'));

      await expect(postServerCount(makeClient(56))).resolves.toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });

    it('does not post before the client has logged in', async () => {
      expect(await postServerCount(makeClient(56, null))).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('startTopggStatsPoster', () => {
    beforeEach(() => {
      process.env.TOPGG_TOKEN = 'token-abc';
    });

    it('posts once immediately so a restart refreshes the listing', async () => {
      expect(startTopggStatsPoster(makeClient(56))).toBe(true);
      await Promise.resolve();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('posts again on every interval tick', async () => {
      startTopggStatsPoster(makeClient(56));
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(STATS_POST_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(STATS_POST_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('keeps ticking after a failed post instead of retrying in a tight loop', async () => {
      fetchMock.mockRejectedValueOnce(new Error('boom'));

      startTopggStatsPoster(makeClient(56));
      await Promise.resolve();
      await Promise.resolve();

      // The failure produced exactly one attempt, not a retry burst.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      await jest.advanceTimersByTimeAsync(STATS_POST_INTERVAL_MS);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reports the count as it is at each tick, not a value captured at startup', async () => {
      const client = makeClient(56);
      startTopggStatsPoster(client);
      await Promise.resolve();

      client.guilds.cache.size = 57;
      await jest.advanceTimersByTimeAsync(STATS_POST_INTERVAL_MS);

      expect((fetchMock.mock.calls[1][1] as any).body).toBe(
        JSON.stringify({ server_count: 57 }),
      );
    });
  });
});
