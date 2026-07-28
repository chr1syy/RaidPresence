jest.mock('../../services/teamService', () => ({
  countTeams: jest.fn(),
  getDefaultTeam: jest.fn(),
  getTeamById: jest.fn(),
  getTeamByName: jest.fn(),
  listTeams: jest.fn(),
}));

import { SlashCommandSubcommandBuilder } from 'discord.js';
import {
  countTeams,
  getDefaultTeam,
  getTeamById,
  getTeamByName,
  listTeams,
} from '../../services/teamService';
import {
  addTeamOption,
  getTeamLabel,
  resolveTeam,
  teamAutocomplete,
  TEAM_OPTION_NAME,
} from '../teamContext';

/** Minimal Team row shaped like the Prisma model. */
function team(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-1',
    guildId: 'guild1',
    name: 'Main',
    isDefault: true,
    createdBy: 'system',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as any;
}

/** Autocomplete interaction stub with a recorded `respond` call. */
function autocompleteInteraction(guildId: string | null, focused: string) {
  return {
    guildId,
    options: { getFocused: () => focused },
    respond: jest.fn().mockResolvedValue(undefined),
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveTeam', () => {
  it('falls back to the default team when no option was supplied', async () => {
    (getDefaultTeam as jest.Mock).mockResolvedValue(team());

    const result = await resolveTeam('guild1', null);

    expect(result.error).toBeUndefined();
    expect(result.team?.id).toBe('team-1');
    expect(getDefaultTeam).toHaveBeenCalledWith('guild1');
    expect(getTeamByName).not.toHaveBeenCalled();
  });

  it('treats a blank/whitespace option like a missing one', async () => {
    (getDefaultTeam as jest.Mock).mockResolvedValue(team());

    const result = await resolveTeam('guild1', '   ');

    expect(result.team?.id).toBe('team-1');
    expect(getTeamByName).not.toHaveBeenCalled();
  });

  it('resolves a named team, trimming the input', async () => {
    (getTeamByName as jest.Mock).mockResolvedValue(team({ id: 'team-2', name: 'Alts', isDefault: false }));

    const result = await resolveTeam('guild1', '  Alts  ');

    expect(getTeamByName).toHaveBeenCalledWith('guild1', 'Alts');
    expect(result.team?.name).toBe('Alts');
    expect(result.error).toBeUndefined();
  });

  it('reports an unknown team as not_found instead of throwing', async () => {
    (getTeamByName as jest.Mock).mockResolvedValue(null);

    const result = await resolveTeam('guild1', 'Ghosts');

    expect(result).toEqual({ team: null, error: 'not_found' });
    expect(getDefaultTeam).not.toHaveBeenCalled();
  });
});

describe('addTeamOption', () => {
  it('attaches an optional autocompleting string option named "team"', () => {
    const subcommand = addTeamOption(
      new SlashCommandSubcommandBuilder().setName('create').setDescription('Create a raid')
    );

    const json = subcommand.toJSON();
    const option = json.options?.find((o: any) => o.name === TEAM_OPTION_NAME) as any;

    expect(option).toBeDefined();
    expect(option.required).toBeFalsy();
    expect(option.autocomplete).toBe(true);
    expect(option.description).toBe('Team (defaults to your main team)');
  });
});

describe('teamAutocomplete', () => {
  it('returns the guild teams filtered by the typed prefix', async () => {
    (listTeams as jest.Mock).mockResolvedValue([
      team({ id: 't1', name: 'Main' }),
      team({ id: 't2', name: 'Mythic Core', isDefault: false }),
      team({ id: 't3', name: 'Alts', isDefault: false }),
    ]);

    const interaction = autocompleteInteraction('guild1', 'my');
    await teamAutocomplete(interaction);

    expect(listTeams).toHaveBeenCalledWith('guild1');
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Mythic Core', value: 'Mythic Core' },
    ]);
  });

  it('returns every team when nothing has been typed yet', async () => {
    (listTeams as jest.Mock).mockResolvedValue([
      team({ id: 't1', name: 'Main' }),
      team({ id: 't2', name: 'Alts', isDefault: false }),
    ]);

    const interaction = autocompleteInteraction('guild1', '');
    await teamAutocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Main', value: 'Main' },
      { name: 'Alts', value: 'Alts' },
    ]);
  });

  it('caps the response at Discord\'s 25-choice limit', async () => {
    (listTeams as jest.Mock).mockResolvedValue(
      Array.from({ length: 40 }, (_, i) => team({ id: `t${i}`, name: `Team ${i}`, isDefault: false }))
    );

    const interaction = autocompleteInteraction('guild1', 'team');
    await teamAutocomplete(interaction);

    expect(interaction.respond.mock.calls[0][0]).toHaveLength(25);
  });

  it('responds empty outside a guild rather than throwing', async () => {
    const interaction = autocompleteInteraction(null, 'main');
    await teamAutocomplete(interaction);

    expect(interaction.respond).toHaveBeenCalledWith([]);
    expect(listTeams).not.toHaveBeenCalled();
  });
});

describe('getTeamLabel()', () => {
  it('returns null for single-team guilds without looking the team up', async () => {
    (countTeams as jest.Mock).mockResolvedValue(1);

    await expect(getTeamLabel('guild1', 'team-1')).resolves.toBeNull();
    expect(getTeamById).not.toHaveBeenCalled();
  });

  it('returns the team name once the guild has more than one team', async () => {
    (countTeams as jest.Mock).mockResolvedValue(2);
    (getTeamById as jest.Mock).mockResolvedValue(team({ id: 'team-2', name: 'Alts', isDefault: false }));

    await expect(getTeamLabel('guild1', 'team-2')).resolves.toBe('Alts');
  });

  it('returns null for a missing teamId without querying', async () => {
    await expect(getTeamLabel('guild1', null)).resolves.toBeNull();
    expect(countTeams).not.toHaveBeenCalled();
  });

  it('returns null when the team row is gone', async () => {
    (countTeams as jest.Mock).mockResolvedValue(3);
    (getTeamById as jest.Mock).mockResolvedValue(null);

    await expect(getTeamLabel('guild1', 'team-deleted')).resolves.toBeNull();
  });
});
