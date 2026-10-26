import { Interaction, PermissionFlagsBits } from 'discord.js';
import type { GuildRuntime } from '../services/guildRuntime';
import { readGuildCustomId } from '../services/guildJobs';
import { getFlowJobToken } from './raidCreateFlow';
import { canManageRaids } from '../utils/permissions';
import { t } from '../utils/localization';

/** Full actual dispatch boundary. UI carries its original publication generation;
 * raw, prior-process and revoked IDs require a fresh authorized slash reissue.
 */
export async function runGuildInteraction(
  runtime: GuildRuntime,
  interaction: Interaction,
  dispatch: (interaction: Interaction) => Promise<void>,
): Promise<void> {
  const freshAction = interaction.isChatInputCommand() || interaction.isAutocomplete();
  const binding = !freshAction && 'customId' in interaction ? readGuildCustomId(interaction.customId) : undefined;
  const rawId = binding?.customId;
  const guildId = binding?.token.guildId ?? interaction.guildId;
  async function reject() {
    // Transport acknowledgement only: no guild output, UI, database or installation admission.
    if (interaction.isAutocomplete() && !interaction.responded) await interaction.respond([]);
    else if ('replied' in interaction && !interaction.replied && !interaction.deferred) await interaction.reply({
      content: t(interaction.locale.startsWith('de') ? 'de' : 'en', 'guildJobUnavailable'), ephemeral: true,
    });
  }
  if (!guildId || (!freshAction && !binding) ||
      (binding && interaction.guildId === null && !rawId?.startsWith('welcome-')) ||
      (binding && interaction.guildId !== null && interaction.guildId !== guildId)) { await reject(); return; }
  const token = binding?.token ?? runtime.jobs.capture(guildId); // Fresh user action only; never late component receipt.
  if (!runtime.jobs.isCurrent(token)) { await reject(); return; }
  // DM welcome IDs carry a guild, but authority always comes from a fresh member lookup there.
  const guild = interaction.guild ?? interaction.client?.guilds.cache.get(guildId);
  if (!guild) { await reject(); return; }
  let handled: boolean | undefined;
  try {
    handled = await runtime.jobs.tryRunWithToken(token, async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const member = await Promise.race([
          guild.members.fetch({ user: interaction.user.id, force: true }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Membership lookup timeout')), 1200); }),
        ]);
        if (!member) throw new Error('Membership required');
        if (!runtime.jobs.isCurrent(token)) throw new Error('Guild generation revoked during authorization');
        if (rawId?.startsWith('rcflow-')) {
          if (getFlowJobToken(rawId, interaction.user.id, guildId) !== token || !(await canManageRaids(member)))
            throw new Error('Original draft and current raid leader authorization required');
        }
        const setupCallback = rawId?.startsWith('welcome-') && !rawId.startsWith('welcome-firstraid:');
        if ((setupCallback || (interaction.isChatInputCommand() && ['config', 'setup'].includes(interaction.commandName))) &&
            !member.permissions.has(PermissionFlagsBits.Administrator)) throw new Error('Administrator required');
        const fresh = new Proxy(interaction, { get(target, key) {
          if (key === 'customId' && rawId !== undefined) return rawId;
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
  if (!handled) await reject();
}
