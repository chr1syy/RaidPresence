import { Interaction, PermissionFlagsBits } from 'discord.js';
import type { GuildRuntime } from '../services/guildRuntime';
import { getFlowJobToken } from './raidCreateFlow';
import { canManageRaids } from '../utils/permissions';
import { t } from '../utils/localization';

/** Fresh commands/autocomplete and already issuance-bound ephemeral guided drafts.
 * Long-lived legacy raid/welcome component IDs remain an explicit integration gap. */
export async function runGuildInteraction(
  runtime: GuildRuntime,
  interaction: Interaction,
  dispatch: (interaction: Interaction) => Promise<void>,
): Promise<void> {
  const issued = 'customId' in interaction
    ? getFlowJobToken(interaction.customId, interaction.user.id, interaction.guildId) : undefined;
  if (!interaction.isChatInputCommand() && !interaction.isAutocomplete() && !issued) {
    await dispatch(interaction); // No late callback is silently assigned a current generation.
    return;
  }
  if (!interaction.guildId) { await dispatch(interaction); return; }
  const token = issued ?? runtime.jobs.capture(interaction.guildId); // Capture at receipt, before network/queue work.
  let handled: boolean | undefined;
  try {
    handled = await runtime.jobs.tryRunWithToken(token, async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const member = await Promise.race([
          interaction.guild!.members.fetch({ user: interaction.user.id, force: true }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Membership lookup timeout')), 1200); }),
        ]);
        if (!member) throw new Error('Membership required');
        if (!runtime.jobs.isCurrent(token)) throw new Error('Guild generation revoked during authorization');
        if (issued && !(await canManageRaids(member))) throw new Error('Raid leader authorization required');
        if (interaction.isChatInputCommand() && ['config', 'setup'].includes(interaction.commandName) &&
            !member.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Administrator required');
        const fresh = new Proxy(interaction, { get(target, key) {
          if (key === 'member') return member;
          if (key === 'memberPermissions') return member.permissions;
          const value = Reflect.get(target, key, target);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        await dispatch(fresh);
        return true;
      } finally { if (timer) clearTimeout(timer); }
    });
  } catch (error) { console.error('Guild interaction rejected:', error); }
  if (!handled) {
    if (interaction.isAutocomplete() && !interaction.responded) await interaction.respond([]);
    else if ('replied' in interaction && !interaction.replied && !interaction.deferred) await interaction.reply({ content: t(interaction.locale.startsWith('de') ? 'de' : 'en', 'guildJobUnavailable'), ephemeral: true });
  }
}
