import { randomBytes } from 'node:crypto';
import { createGuildRemovalDraft, GuildJobToken } from './guildRemoval';
import { GuildLifecyclePayload } from './guildLifecycle';
import { invalidateGuildDrafts } from '../events/raidCreateFlow';

/**
 * Inactive adapter: no index.ts import, event registration, timers or env switch.
 * Callers must put the COMPLETE awaited handler inside writer(), not individual
 * queries. A callback must carry a binding issued with its original job token.
 */
export function createGuildWriterAdapter() {
  const callbacks = new Map<string, { token: GuildJobToken; customId: string; userId?: string }>();
  const coordinator = createGuildRemovalDraft({
    invalidateGuild(guildId) {
      invalidateGuildDrafts(guildId);
      for (const [id, binding] of callbacks) {
        if (binding.token.guildId === guildId) callbacks.delete(id);
      }
    },
  });

  return {
    coordinator,

    async initialize(guild: GuildLifecyclePayload, initialize: (token: GuildJobToken) => Promise<void>) {
      const token = await coordinator.join(guild);
      if (!token) return false; // Legacy hold or superseded join.
      return coordinator.runWithToken(token, async () => { await initialize(token); return true; });
    },

    writer<T>(token: GuildJobToken, operation: () => Promise<T>) {
      return coordinator.runWithToken(token, operation);
    },

    /** Capture this when publishing UI inside a job; never bind on callback receipt. */
    bindCallback(token: GuildJobToken, customId: string, userId?: string): string {
      if (!coordinator.isCurrent(token)) throw new Error('Cannot publish UI for a revoked guild generation');
      const id = `gw:${randomBytes(18).toString('base64url')}`;
      callbacks.set(id, { token, customId, userId });
      return id;
    },

    async callback<T>(
      input: { customId: string; guildId: string | null; userId: string },
      authorize: (guildId: string, userId: string) => Promise<boolean>,
      handler: (originalCustomId: string, token: GuildJobToken) => Promise<T>,
    ): Promise<{ status: 'executed'; value: T } | { status: 'rejected' }> {
      const binding = callbacks.get(input.customId);
      if (!binding || !coordinator.isCurrent(binding.token) ||
          (input.guildId !== null && input.guildId !== binding.token.guildId) ||
          (binding.userId !== undefined && binding.userId !== input.userId)) return { status: 'rejected' };
      // No automatic defer: handlers opening a modal need an untouched response.
      // Busy jobs are rejected immediately; callers must reply/respond([]) at once.
      const result = await coordinator.tryRunWithToken(binding.token, async () => {
        // Re-authorize at execution, including DM customIds, against current guild
        // membership/permissions. A successful old authorization is not retained.
        if (!(await authorize(binding.token.guildId, input.userId))) return undefined;
        return { status: 'executed' as const, value: await handler(binding.customId, binding.token) };
      });
      return result ?? { status: 'rejected' };
    },
  };
}
