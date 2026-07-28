import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { handleButton, handleModalSubmit } from '../buttonHandler';
import { handleSelectMenu } from '../selectHandler';
import prisma from '../../database/client';
import { ButtonInteraction, ModalSubmitInteraction, StringSelectMenuInteraction } from 'discord.js';

jest.mock('../../database/client');
jest.mock('../../commands/raid', () => ({
  createRaidEmbed: jest.fn(() => Promise.resolve({})),
}));
jest.mock('../../services/entitlementService', () => ({
  getTier: jest.fn(() => Promise.resolve('FREE')),
  hasFeature: jest.fn(() => false),
}));

const raidId = 'raid-team-1';
const userId = 'user-1';
const guildId = 'guild-1';

/**
 * RPTIER Phase 4: attendance interactions must keep the denormalized
 * RaidAttendance.teamId in sync with the raid it belongs to.
 */
describe('Attendance interactions - team consistency', () => {
  const mockRaid = {
    id: raidId,
    guildId,
    teamId: 'team-42',
    status: 'open',
    messageId: 'message-1',
    channelId: 'channel-1',
    roles: '',
    guild: { language: 'en' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.raid.findUnique as jest.Mock<any>).mockResolvedValue(mockRaid);
  });

  const makeButtonInteraction = (subAction: string): Partial<ButtonInteraction> =>
    ({
      customId: `raid_${subAction}_${raidId}`,
      guildId,
      user: { id: userId } as any,
      deferReply: jest.fn(),
      editReply: jest.fn(),
      message: { edit: jest.fn() } as any,
      client: { channels: { fetch: jest.fn() } } as any,
    }) as any;

  describe('buttonHandler', () => {
    it.each([
      ['optin', 'attending'],
      ['late', 'late'],
      ['optout', 'opted_out'],
    ])('writes the raid team when handling %s', async (subAction, expectedStatus) => {
      (prisma.raidAttendance.findUnique as jest.Mock<any>).mockResolvedValueOnce({
        status: 'unknown',
      });

      await handleButton(makeButtonInteraction(subAction) as ButtonInteraction);

      const call = (prisma.raidAttendance.update as jest.Mock).mock.calls[0][0] as any;
      expect(call.data.status).toBe(expectedStatus);
      expect(call.data.teamId).toBe('team-42');
    });

    it('omits teamId when the raid has none (pre-migration data)', async () => {
      (prisma.raid.findUnique as jest.Mock<any>).mockResolvedValue({ ...mockRaid, teamId: null });
      (prisma.raidAttendance.findUnique as jest.Mock<any>).mockResolvedValueOnce({
        status: 'unknown',
      });

      await handleButton(makeButtonInteraction('optin') as ButtonInteraction);

      const call = (prisma.raidAttendance.update as jest.Mock).mock.calls[0][0] as any;
      expect(call.data).not.toHaveProperty('teamId');
    });
  });

  describe('opt-out reason modal', () => {
    it('writes the raid team alongside the reason', async () => {
      (prisma.raidAttendance.findUnique as jest.Mock<any>).mockResolvedValueOnce({
        status: 'attending',
      });

      const interaction = {
        customId: `optout_reason_${raidId}_${userId}`,
        user: { id: userId },
        fields: { getTextInputValue: jest.fn(() => 'Work emergency') },
        deferReply: jest.fn(),
        editReply: jest.fn(),
        client: { channels: { fetch: jest.fn() } },
      } as any;

      await handleModalSubmit(interaction as ModalSubmitInteraction);

      const call = (prisma.raidAttendance.update as jest.Mock).mock.calls[0][0] as any;
      expect(call.data.optoutReason).toBe('Work emergency');
      expect(call.data.teamId).toBe('team-42');
    });
  });

  describe('selectHandler', () => {
    const makeSelectInteraction = (): Partial<StringSelectMenuInteraction> =>
      ({
        customId: `spec_select_${raidId}_Warrior`,
        values: ['Arms'],
        user: { id: userId } as any,
        guild: {
          id: guildId,
          members: {
            fetch: jest.fn(() =>
              Promise.resolve({ displayName: 'Player', roles: { cache: new Map() } })
            ),
          },
        } as any,
        deferUpdate: jest.fn(),
        editReply: jest.fn(),
        client: { channels: { fetch: jest.fn() } } as any,
      }) as any;

    it('writes the raid team when saving class/spec', async () => {
      await handleSelectMenu(makeSelectInteraction() as StringSelectMenuInteraction);

      const call = (prisma.raidAttendance.update as jest.Mock).mock.calls[0][0] as any;
      expect(call.data.wowClass).toBe('Warrior');
      expect(call.data.wowSpec).toBe('Arms');
      expect(call.data.teamId).toBe('team-42');
    });

    it('omits teamId when the raid has none (pre-migration data)', async () => {
      (prisma.raid.findUnique as jest.Mock<any>).mockResolvedValue({ ...mockRaid, teamId: null });

      await handleSelectMenu(makeSelectInteraction() as StringSelectMenuInteraction);

      const call = (prisma.raidAttendance.update as jest.Mock).mock.calls[0][0] as any;
      expect(call.data).not.toHaveProperty('teamId');
    });
  });
});
