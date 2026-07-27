import {
  AutocompleteInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import {
  countTeams,
  getDefaultTeam,
  getTeamById,
  getTeamByName,
  listTeams,
  type Team,
} from '../services/teamService';

/** Discord hard limit on autocomplete choices per response. */
const MAX_AUTOCOMPLETE_CHOICES = 25;

/** Name of the shared, optional `team` option every team-aware subcommand carries. */
export const TEAM_OPTION_NAME = 'team';

/**
 * Result of {@link resolveTeam}.
 *
 * Either a team was resolved, or the explicitly named team does not exist in that guild.
 * Modelled as a union so callers cannot read `team` on the failure path.
 */
export type TeamResolution =
  | { team: Team; error?: undefined }
  | { team: null; error: 'not_found' };

/**
 * Resolves the team a command should operate on.
 *
 * Backwards compatibility: when no `team` option was supplied the guild's default team is
 * used, so single-team (and all FREE) guilds keep their previous behaviour. A named team
 * that does not exist is reported as a failure rather than thrown, because the command
 * layer answers it with an ephemeral `teamNotFound` message.
 */
export async function resolveTeam(
  guildId: string,
  teamNameOption: string | null
): Promise<TeamResolution> {
  const name = teamNameOption?.trim();

  if (!name) {
    return { team: await getDefaultTeam(guildId) };
  }

  const team = await getTeamByName(guildId, name);
  if (!team) return { team: null, error: 'not_found' };

  return { team };
}

/**
 * Name of a raid's team, but only when it is worth showing.
 *
 * Returns `null` for single-team guilds so their command output stays byte-for-byte
 * identical to the pre-multi-team wording, and also when the raid carries no (or a
 * dangling) `teamId`. Callers treat `null` as "say nothing about teams".
 */
export async function getTeamLabel(
  guildId: string,
  teamId: string | null | undefined
): Promise<string | null> {
  if (!teamId) return null;
  if ((await countTeams(guildId)) <= 1) return null;

  const team = await getTeamById(teamId);
  return team?.name ?? null;
}

/**
 * Attaches the shared optional `team` option to a subcommand builder.
 *
 * Centralised so every team-aware subcommand across `raid`, `stats` and friends exposes an
 * identical option definition (name, description, autocomplete).
 */
export function addTeamOption(
  subcommand: SlashCommandSubcommandBuilder
): SlashCommandSubcommandBuilder {
  return subcommand.addStringOption((option) =>
    option
      .setName(TEAM_OPTION_NAME)
      .setDescription('Team (defaults to your main team)')
      .setRequired(false)
      .setAutocomplete(true)
  );
}

/**
 * Answers a `team` option autocomplete with the guild's teams, prefix-filtered.
 *
 * Silently does nothing outside a guild — Discord accepts an unanswered autocomplete far
 * better than a thrown handler.
 */
export async function teamAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused().toLowerCase();
  const teams = await listTeams(interaction.guildId);

  const choices = teams
    .filter((team) => team.name.toLowerCase().startsWith(focused))
    .slice(0, MAX_AUTOCOMPLETE_CHOICES)
    .map((team) => ({ name: team.name, value: team.name }));

  await interaction.respond(choices);
}
