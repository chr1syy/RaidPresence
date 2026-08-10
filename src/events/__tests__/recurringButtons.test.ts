/**
 * Button surface of the two retention features: the post-raid nudge, the "repeat this
 * weekly" bridge, and the resume button on a paused series.
 *
 * The permission cases matter most — these buttons live in a public channel where anyone
 * can see and click them, and a stranger must not be able to schedule the guild's raids.
 */

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../../commands/raid', () => ({ createRaidEmbed: jest.fn() }));
jest.mock('../../services/entitlementService', () => ({
  getTier: jest.fn().mockResolvedValue('FREE'),
  hasFeature: jest.fn().mockReturnValue(false),
}));
jest.mock('../../services/recurringRaidService', () => ({
  advanceSeries: jest.fn(),
  createFollowUpRaid: jest.fn(),
  followUpFailureMessage: jest.fn(() => 'failure'),
  retireNudge: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import {
  advanceSeries,
  createFollowUpRaid,
  retireNudge,
} from '../../services/recurringRaidService';
import { handleButton } from '../buttonHandler';

const RAID = {
  id: 'raid-1',
  guildId: 'guild-1',
  channelId: 'channel-1',
  createdBy: 'leader-1',
  description: 'Weekly Raid',
  recurrenceRule: null,
  recurrenceActive: true,
  recurrenceSilentStreak: 0,
  guild: { language: 'en' },
};

function buttonInteraction(customId: string, userId: string) {
  return {
    customId,
    user: { id: userId },
    guildId: 'guild-1',
    member: { id: userId },
    client: {},
    message: { edit: jest.fn().mockResolvedValue(undefined) },
    deferReply: jest.fn().mockResolvedValue(undefined),
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('post-raid nudge button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(RAID);
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    (canManageRaids as jest.Mock).mockResolvedValue(false);
    (createFollowUpRaid as jest.Mock).mockResolvedValue({
      ok: true,
      raidId: 'raid-2',
      raidDate: new Date('2026-10-29T19:00:00.000Z'),
      memberCount: 12,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('refuses a member who neither created the raid nor leads raids', async () => {
    const interaction = buttonInteraction('raid_nudge_raid-1', 'stranger-9');

    await handleButton(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Only the raid leader'),
    });
    expect(createFollowUpRaid).not.toHaveBeenCalled();
  });

  it('lets the raid creator schedule next week', async () => {
    const interaction = buttonInteraction('raid_nudge_raid-1', 'leader-1');

    await handleButton(interaction);

    expect(createFollowUpRaid).toHaveBeenCalledWith(
      interaction.client,
      RAID,
      { mode: 'none', createdBy: 'leader-1' },
    );
    // The button is a one-shot: it goes away as soon as it worked.
    expect(retireNudge).toHaveBeenCalledWith(interaction.client, RAID);
    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.content).toContain('<t:1793300400:F>');
    // …and the success reply is the bridge into a real series.
    expect(reply.components[0].toJSON().components[0].custom_id).toBe('raid_series_raid-2');
  });

  it('lets any raid leader schedule next week', async () => {
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    const interaction = buttonInteraction('raid_nudge_raid-1', 'officer-2');

    await handleButton(interaction);

    expect(createFollowUpRaid).toHaveBeenCalled();
  });

  it('reports a failure without retiring the button', async () => {
    (createFollowUpRaid as jest.Mock).mockResolvedValue({ ok: false, reason: 'weekly_limit', max: 5 });
    const interaction = buttonInteraction('raid_nudge_raid-1', 'leader-1');

    await handleButton(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({ content: 'failure' });
    expect(retireNudge).not.toHaveBeenCalled();
  });
});

describe('"repeat this weekly" button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue(RAID);
    (prisma.raid.update as jest.Mock).mockResolvedValue({});
    (canManageRaids as jest.Mock).mockResolvedValue(false);
  });

  it('turns the raid into a weekly series and consumes its own button', async () => {
    const interaction = buttonInteraction('raid_series_raid-1', 'leader-1');

    await handleButton(interaction);

    expect(prisma.raid.update).toHaveBeenCalledWith({
      where: { id: 'raid-1' },
      data: { recurrenceRule: 'weekly', recurrenceActive: true, recurrenceSilentStreak: 0 },
    });
    expect(interaction.update).toHaveBeenCalledWith({
      content: expect.stringContaining('Weekly series started'),
      components: [],
    });
  });

  it('refuses a stranger', async () => {
    const interaction = buttonInteraction('raid_series_raid-1', 'stranger-9');

    await handleButton(interaction);

    expect(prisma.raid.update).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining('Only raid leaders'),
      ephemeral: true,
    });
  });
});

describe('resume button on a paused series', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (prisma.raid.findUnique as jest.Mock).mockResolvedValue({
      ...RAID,
      recurrenceRule: 'weekly',
      recurrenceActive: false,
      recurrenceSilentStreak: 3,
    });
    (prisma.raid.update as jest.Mock).mockResolvedValue({ id: 'raid-1' });
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (advanceSeries as jest.Mock).mockResolvedValue({
      ok: true,
      raidId: 'raid-2',
      raidDate: new Date('2026-10-29T19:00:00.000Z'),
      memberCount: 12,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('reactivates the series, clears the silent streak and creates the skipped raid', async () => {
    const interaction = buttonInteraction('raid_resume_raid-1', 'leader-1');

    await handleButton(interaction);

    expect(prisma.raid.update).toHaveBeenCalledWith({
      where: { id: 'raid-1' },
      data: { recurrenceRule: 'weekly', recurrenceActive: true, recurrenceSilentStreak: 0 },
    });
    expect(advanceSeries).toHaveBeenCalled();
    expect(interaction.message.edit).toHaveBeenCalledWith({ components: [] });
    expect(interaction.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining('resumed'),
      ephemeral: true,
    });
  });

  it('refuses a stranger without touching the series', async () => {
    (canManageRaids as jest.Mock).mockResolvedValue(false);
    const interaction = buttonInteraction('raid_resume_raid-1', 'stranger-9');

    await handleButton(interaction);

    expect(prisma.raid.update).not.toHaveBeenCalled();
    expect(advanceSeries).not.toHaveBeenCalled();
  });
});
