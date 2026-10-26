import { createGuildJobCoordinator } from './guildJobs';
import { GuildLifecyclePayload, markGuildDeparted, syncGuildOnJoin } from './guildLifecycle';

/** Retaining runtime only. This module cannot import or invoke the deletion adapter. */
export function createGuildRuntime(invalidateGuild?: (guildId: string) => void) {
  const jobs = createGuildJobCoordinator({ invalidateGuild });
  const joins = new WeakMap<GuildLifecyclePayload, ReturnType<typeof jobs.observe>>();
  const observed = new WeakMap<GuildLifecyclePayload, ReturnType<typeof jobs.capture>>();
  const departures = new WeakMap<GuildLifecyclePayload, Promise<unknown>>();
  return {
    jobs,
    join(guild: GuildLifecyclePayload, initialize: () => Promise<void> = async () => {}) {
      const previous = joins.get(guild); if (previous) return previous;
      const result = jobs.observe(guild.id, async () => {
        // Preserve the existing live contract, including returning leftAt history.
        await syncGuildOnJoin(guild);
        await initialize();
      });
      observed.set(guild, jobs.capture(guild.id));
      joins.set(guild, result); return result;
    },
    depart(guild: GuildLifecyclePayload) {
      const previous = departures.get(guild); if (previous) return previous;
      const observedToken = observed.get(guild);
      const current = jobs.capture(guild.id);
      // An unbound old payload cannot revoke another positively observed object.
      if (!observedToken && jobs.isCurrent(current)) return Promise.resolve(undefined);
      const token = observedToken ?? current;
      const detectedAt = new Date(); // Preserve event-detection time while awaiting the drain.
      const result = jobs.depart(token, () => markGuildDeparted(guild, { now: detectedAt }));
      departures.set(guild, result); return result;
    },
  };
}
export type GuildRuntime = ReturnType<typeof createGuildRuntime>;
