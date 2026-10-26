import { AsyncLocalStorage } from 'node:async_hooks';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const outputContext = new AsyncLocalStorage<{ token: GuildJobToken; check: () => void; checkLifetime: () => void; maintenance?: boolean }>();
const cleanupContext = new AsyncLocalStorage<boolean>();

export function currentGuildJobToken(): GuildJobToken | undefined {
  const running = outputContext.getStore(); if (running?.maintenance) return undefined; running?.check(); return running?.token;
}

export function assertGuildJobActive(): void {
  const running = outputContext.getStore();
  if (cleanupContext.getStore() || running?.maintenance) running?.checkLifetime(); else running?.check();
}

/** Only compensation for a row created by this still-running job. Rejoin remains queued.
 * Never use for command writes, retained history, or guild deletion.
 */
export async function guildJobCleanup<T>(operation: () => Promise<T>): Promise<T> {
  outputContext.getStore()?.checkLifetime();
  return cleanupContext.run(true, async () => await operation());
}

/** Fences output initiated after revocation. In-flight network requests cannot be cancelled. */
export async function guildOutput<T>(operation: () => Promise<T>, cleanupCreatedMessage = false): Promise<T> {
  outputContext.getStore()?.check();
  const result = await operation();
  try { outputContext.getStore()?.check(); }
  catch (error) {
    const message = result as { delete?: () => Promise<unknown> } | null;
    if (cleanupCreatedMessage && message && typeof message.delete === 'function') await message.delete().catch(() => undefined);
    throw error;
  }
  return result;
}

/** Process-only issuance provenance: restart requires an authorized refresh/reissue.
 * The MAC binds the complete raw ID, so a public button cannot authorize a forged modal.
 * No Discord/user data or persistent installation/retention record is introduced.
 */
const issuedUI = new WeakMap<GuildJobToken, { nonce: string; key: Buffer }>();
const uiTokens = new Map<string, GuildJobToken>();
function uiMac(key: Buffer, raw: string) { return createHmac('sha256', key).update(raw).digest('base64url').slice(0, 11); }
export function bindGuildCustomId(raw: string): string {
  const token = currentGuildJobToken();
  if (!token) return raw; // Uncoordinated builders cannot manufacture admitted callbacks.
  let binding = issuedUI.get(token);
  if (!binding) {
    binding = { nonce: randomBytes(8).toString('base64url'), key: randomBytes(32) };
    issuedUI.set(token, binding); uiTokens.set(binding.nonce, token);
  }
  const id = `gj:${binding.nonce}:${uiMac(binding.key, raw)}:${raw}`;
  if (id.length > 100) throw new Error('Guild-bound custom ID exceeds Discord limit');
  return id;
}
export function readGuildCustomId(id: string): { token: GuildJobToken; customId: string } | undefined {
  const match = /^gj:([^:]+):([^:]+):(.+)$/.exec(id);
  if (!match) return undefined;
  const token = uiTokens.get(match[1]); const binding = token && issuedUI.get(token);
  if (!token || !binding) return undefined;
  const expected = Buffer.from(uiMac(binding.key, match[3])); const actual = Buffer.from(match[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
  return { token, customId: match[3] };
}
function revokeUI(token: GuildJobToken) {
  const binding = issuedUI.get(token); if (binding) uiTokens.delete(binding.nonce);
  issuedUI.delete(token);
}

export interface GuildJobToken {
  readonly guildId: string;
  readonly generation: number;
}
interface Work {
  token: GuildJobToken;
  accepting: boolean;
  pending: number;
  tail: Promise<unknown>;
}

/** One process-local awaited boundary. No database or destructive operations. */
export function createGuildJobCoordinator(options: { invalidateGuild?: (guildId: string) => void } = {}) {
  const work = new Map<string, Work>();
  const context = new AsyncLocalStorage<{ token: GuildJobToken; active: boolean; maintenance?: boolean }>();
  function state(guildId: string): Work {
    let entry = work.get(guildId);
    if (!entry) {
      entry = { token: Object.freeze({ guildId, generation: 0 }), accepting: false, pending: 0, tail: Promise.resolve() };
      work.set(guildId, entry);
    }
    return entry;
  }
  function enqueue<T>(entry: Work, operation: () => Promise<T>): Promise<T> {
    ++entry.pending;
    const result = entry.tail.then(operation).finally(() => { --entry.pending; });
    entry.tail = result.catch(() => undefined);
    return result;
  }
  function advance(entry: Work) {
    revokeUI(entry.token);
    entry.token = Object.freeze({ guildId: entry.token.guildId, generation: entry.token.generation + 1 });
    return entry.token;
  }
  function owns(token: GuildJobToken) { return work.get(token.guildId)?.token === token; }
  function isCurrent(token: GuildJobToken) { return Boolean(work.get(token.guildId)?.accepting && owns(token)); }
  async function execute<T>(token: GuildJobToken, operation: () => Promise<T>) {
    const running = { token, active: true };
    try { return await context.run(running, () => outputContext.run({ token, checkLifetime: () => { if (!running.active) throw new Error('Guild job context expired'); }, check: () => {
      if (!running.active || !isCurrent(token)) throw new Error('Guild generation revoked before output');
    } }, async () => await operation())); }
    finally { running.active = false; }
  }
  function runWithToken<T>(token: GuildJobToken, operation: () => Promise<T>): Promise<T | undefined> {
    const parent = context.getStore();
    if (parent) {
      if (parent.maintenance || !parent.active || parent.token !== token) return Promise.reject(new Error('Guild job context expired or belongs to another generation'));
      return operation();
    }
    const entry = work.get(token.guildId);
    if (!entry || !isCurrent(token)) return Promise.resolve(undefined);
    return enqueue(entry, async () => isCurrent(token) ? execute(token, operation) : undefined);
  }
  return {
    capture(guildId: string) { return state(guildId).token; },
    snapshot() { return [...work.values()].filter(e => e.accepting).map(e => e.token); },
    owns, isCurrent, runWithToken,
    /** Retained-row maintenance shares the drain, but never admits an installation or UI.
     * Only idempotent, predicate-checked maintenance may use this boundary.
     */
    runMaintenance<T>(guildId: string, operation: () => Promise<T>): Promise<T> {
      if (context.getStore()) return Promise.reject(new Error('Maintenance cannot nest in a guild job'));
      const entry = state(guildId);
      return enqueue(entry, async () => {
        const running = { token: entry.token, active: true, maintenance: true };
        const checkLifetime = () => { if (!running.active) throw new Error('Maintenance context expired'); };
        try { return await context.run(running, () => outputContext.run({ token: entry.token, maintenance: true,
          checkLifetime, check: () => { throw new Error('Maintenance cannot publish guild output'); },
        }, async () => await operation())); }
        finally { running.active = false; }
      });
    },
    current: () => context.getStore(),
    assertOutput() {
      const running = context.getStore();
      if (running && (!running.active || !isCurrent(running.token))) throw new Error('Guild generation revoked before output');
    },
    run<T>(guildId: string, operation: () => Promise<T>) {
      const parent = context.getStore();
      if (parent && parent.token.guildId !== guildId) return Promise.reject(new Error('Cross-guild nested job is not allowed'));
      return runWithToken(parent?.token ?? state(guildId).token, operation);
    },
    tryRunWithToken<T>(token: GuildJobToken, operation: () => Promise<T>) {
      if (!context.getStore() && work.get(token.guildId)?.pending) return Promise.resolve(undefined);
      return runWithToken(token, operation);
    },
    observe(guildId: string, initialize: (token: GuildJobToken) => Promise<boolean | void>): Promise<GuildJobToken | undefined> {
      if (context.getStore()) return Promise.reject(new Error('Guild lifecycle cannot be nested inside a writer job'));
      const entry = state(guildId); const replacing = entry.token.generation > 0;
      const token = advance(entry); entry.accepting = true;
      try { if (replacing) options.invalidateGuild?.(guildId); }
      catch (error) { entry.accepting = false; return Promise.reject(error); }
      return enqueue(entry, async () => {
        if (!owns(token)) return undefined;
        try {
          if (replacing) options.invalidateGuild?.(guildId);
          if (await execute(token, () => initialize(token)) === false) {
            if (owns(token)) entry.accepting = false;
            return undefined;
          }
          return owns(token) && entry.accepting ? token : undefined;
        } catch (error) { if (owns(token)) entry.accepting = false; throw error; }
      });
    },
    depart<T>(token: GuildJobToken, operation: () => Promise<T>): Promise<T | undefined> {
      if (context.getStore()) return Promise.reject(new Error('Guild lifecycle cannot be nested inside a writer job'));
      if (!owns(token)) return Promise.resolve(undefined);
      const entry = state(token.guildId); advance(entry); entry.accepting = false;
      try { options.invalidateGuild?.(token.guildId); }
      catch (error) { return Promise.reject(error); }
      return enqueue(entry, async () => { options.invalidateGuild?.(token.guildId); return operation(); });
    },
    forget(guildId: string) {
      const entry = work.get(guildId);
      if (entry && !entry.accepting && entry.pending === 0) work.delete(guildId);
    },
  };
}
