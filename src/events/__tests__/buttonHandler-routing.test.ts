import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { handleButton, pendingBulkCloses, pendingRaidCreations } from '../buttonHandler';
import prisma from '../../database/client';
import { ButtonInteraction } from 'discord.js';

jest.mock('../../database/client');
jest.mock('../../commands/raid', () => ({
  createRaidEmbed: jest.fn(),
}));

describe('Button Handler Routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pendingRaidCreations.clear();
    pendingBulkCloses.clear();
  });

  it('handles raid_optout_* IDs and preserves full raid ID payload', async () => {
    const raidId = 'raid_with_extra_segments';
    const userId = 'user-123';
    const showModal = jest.fn();

    const interaction = {
      customId: `raid_optout_${raidId}`,
      user: { id: userId },
      showModal,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(showModal).toHaveBeenCalledTimes(1);
    const modal = showModal.mock.calls[0][0] as any;
    expect(modal.toJSON().custom_id).toBe(`optout_reason_${raidId}_${userId}`);
  });

  it('routes raid_optin_* IDs with full raid ID', async () => {
    const raidId = 'raid_with_extra_segments';
    const deferReply = jest.fn();
    const editReply = jest.fn();

    (prisma.raid.findUnique as jest.Mock<any>).mockResolvedValueOnce(null);

    const interaction = {
      customId: `raid_optin_${raidId}`,
      user: { id: 'user-123' },
      deferReply,
      editReply,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(prisma.raid.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: raidId },
      })
    );
    expect(editReply).toHaveBeenCalledWith({ content: '❌ Raid not found.' });
  });

  it('routes raid_late_* IDs with full raid ID', async () => {
    const raidId = 'raid_with_extra_segments';
    const deferReply = jest.fn();
    const editReply = jest.fn();

    (prisma.raid.findUnique as jest.Mock<any>).mockResolvedValueOnce(null);

    const interaction = {
      customId: `raid_late_${raidId}`,
      user: { id: 'user-123' },
      deferReply,
      editReply,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(prisma.raid.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: raidId },
      })
    );
    expect(editReply).toHaveBeenCalledWith({ content: '❌ Raid not found.' });
  });

  it('routes raid_class_* IDs with full raid ID', async () => {
    const raidId = 'raid_with_extra_segments';
    const reply = jest.fn();

    (prisma.raidAttendance.findUnique as jest.Mock<any>).mockResolvedValueOnce(null);

    const interaction = {
      customId: `raid_class_${raidId}`,
      user: { id: 'user-123' },
      reply,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(prisma.raidAttendance.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          raidId_userId: {
            raidId,
            userId: 'user-123',
          },
        },
      })
    );
    expect(reply).toHaveBeenCalledWith({
      content: '❌ You are not on the attendance list for this raid.',
      ephemeral: true,
    });
  });

  it('keeps feedback buttons working when raid IDs contain underscores', async () => {
    const raidId = 'raid_with_extra_segments';
    const showModal = jest.fn();

    const interaction = {
      customId: `feedback_great_${raidId}`,
      user: { id: 'user-123' },
      showModal,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(showModal).toHaveBeenCalledTimes(1);
    const modal = showModal.mock.calls[0][0] as any;
    expect(modal.toJSON().custom_id).toBe(`feedback_comment_${raidId}_user-123_great`);
  });

  it('keeps create_confirm_ IDs working with underscore confirmation IDs', async () => {
    const confirmationId = 'confirm_with_extra_segments';
    pendingRaidCreations.set(confirmationId, {
      userId: 'owner-user',
      guildId: 'guild-1',
      raidDate: new Date('2026-02-14T12:00:00.000Z'),
      title: 'Test Raid',
      roles: 'Raider',
      eligibleMembers: new Set<string>(),
      guildData: { language: 'en' },
      channel: {},
    });

    const deferReply = jest.fn();
    const editReply = jest.fn();

    const interaction = {
      customId: `create_confirm_${confirmationId}`,
      user: { id: 'different-user' },
      deferReply,
      editReply,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(editReply).toHaveBeenCalledWith({ content: '❌ This confirmation is not for you.' });
  });

  it('keeps close_all_confirm_ IDs working with underscore confirmation IDs', async () => {
    const confirmationId = 'close_batch_with_extra_segments';
    pendingBulkCloses.set(confirmationId, {
      userId: 'owner-user',
      guildId: 'guild-1',
      beforeDate: new Date('2026-02-14T12:00:00.000Z'),
      raidIds: ['raid-1'],
    });

    const deferReply = jest.fn();
    const editReply = jest.fn();

    const interaction = {
      customId: `close_all_confirm_${confirmationId}`,
      user: { id: 'different-user' },
      deferReply,
      editReply,
    } as unknown as ButtonInteraction;

    await handleButton(interaction);

    expect(editReply).toHaveBeenCalledWith({ content: '❌ This confirmation is not for you.' });
  });
});
