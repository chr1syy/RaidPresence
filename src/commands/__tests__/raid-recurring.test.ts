/**
 * `/raid recurring start|stop` — the manual switch for a weekly series.
 *
 * A series nobody can stop is a spam generator, so the stop path is the load-bearing
 * test here: it must work from *any* raid of the series and must flip the flag on the
 * instance the scheduler actually reads (the tail).
 */

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../../middleware/premiumGate', () => ({
  gateFeature: jest.fn().mockResolvedValue(true),
  premiumFooterHint: jest.fn().mockReturnValue('-# hint'),
  freeTierHint: jest.fn().mockResolvedValue(''),
}));
jest.mock('../../services/entitlementService', () => ({
  getTier: jest.fn().mockResolvedValue('FREE'),
  hasFeature: jest.fn().mockReturnValue(false),
  tryConsumeWeeklyRaid: jest.fn(),
  skuToTier: jest.fn(),
  FEATURE_TIERS: {},
}));
jest.mock('../../utils/teamContext', () => ({
  addTeamOption: (b: any) => b,
  getTeamLabel: jest.fn().mockResolvedValue(null),
  resolveTeam: jest.fn(),
  TEAM_OPTION_NAME: 'team',
}));

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import command from '../raid';

const HEAD = {
  id: 'raid-head',
  guildId: 'guild-1',
  teamId: 'team-1',
  description: 'Weekly Raid',
  recurrenceRule: 'weekly',
  recurrenceActive: true,
  recurrenceSilentStreak: 0,
};

const TAIL = { ...HEAD, id: 'raid-tail', recurrenceParentId: 'raid-head' };

function interaction(subcommand: 'start' | 'stop', raidId = 'raid-head') {
  return {
    guild: { id: 'guild-1' },
    guildId: 'guild-1',
    member: { id: 'leader-1' },
    user: { id: 'leader-1' },
    isChatInputCommand: () => true,
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    options: {
      getSubcommandGroup: jest.fn().mockReturnValue('recurring'),
      getSubcommand: jest.fn().mockReturnValue(subcommand),
      get: jest.fn((key: string) => (key === 'raid_id' ? { value: raidId } : undefined)),
    },
  } as any;
}

describe('/raid recurring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ id: 'guild-1', language: 'en' });
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(HEAD);
    (prisma.raid.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
  });

  it('stops the series and reports it', async () => {
    const cmd = interaction('stop');

    await command.execute(cmd);

    expect(prisma.raid.update).toHaveBeenCalledWith({
      where: { id: 'raid-head' },
      data: { recurrenceActive: false },
    });
    expect(cmd.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('stopped'),
    });
  });

  it('stops the series from any instance by walking to the newest one', async () => {
    // The leader still has the ID of last month's raid; the scheduler only ever looks at
    // the tail, so that is where the flag has to land.
    (prisma.raid.findFirst as jest.Mock).mockResolvedValueOnce(TAIL).mockResolvedValueOnce(null);

    await command.execute(interaction('stop'));

    expect(prisma.raid.update).toHaveBeenCalledWith({
      where: { id: 'raid-tail' },
      data: { recurrenceActive: false },
    });
  });

  it('says so when there is no active series to stop', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      ...HEAD,
      recurrenceRule: null,
    });
    const cmd = interaction('stop');

    await command.execute(cmd);

    expect(prisma.raid.update).not.toHaveBeenCalled();
    expect(cmd.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('not part of an active weekly series'),
    });
  });

  it('starts a series on a raid that had none', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({ ...HEAD, recurrenceRule: null });
    const cmd = interaction('start');

    await command.execute(cmd);

    expect(prisma.raid.update).toHaveBeenCalledWith({
      where: { id: 'raid-head' },
      data: { recurrenceRule: 'weekly', recurrenceActive: true, recurrenceSilentStreak: 0 },
    });
  });

  it('is a no-op when the series is already running', async () => {
    const cmd = interaction('start');

    await command.execute(cmd);

    expect(prisma.raid.update).not.toHaveBeenCalled();
    expect(cmd.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('already repeats weekly'),
    });
  });

  it('refuses a member who cannot manage raids', async () => {
    (canManageRaids as jest.Mock).mockResolvedValue(false);
    const cmd = interaction('stop');

    await command.execute(cmd);

    expect(prisma.raid.update).not.toHaveBeenCalled();
    expect(cmd.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Only raid leaders'),
    });
  });

  it('refuses a raid from another guild', async () => {
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({ ...HEAD, guildId: 'other-guild' });
    const cmd = interaction('stop');

    await command.execute(cmd);

    expect(prisma.raid.update).not.toHaveBeenCalled();
  });
});
