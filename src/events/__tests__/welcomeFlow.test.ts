/**
 * Tests for the welcome-message buttons (issue #39).
 *
 * The interesting case is the DM. The welcome message is delivered by DM to whoever
 * installed the bot and only falls back to the system channel, so the buttons spend
 * most of their life in an interaction with no guild, no channel and no member.
 */

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
jest.mock('../raidCreateFlow', () => ({
  startGuidedRaidCreate: jest.fn().mockResolvedValue(undefined),
}));

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import { startGuidedRaidCreate } from '../raidCreateFlow';
import {
  handleTimezoneSelect,
  isWelcomeButton,
  isWelcomeSelect,
  routeWelcomeButton,
} from '../welcomeFlow';

const GUILD_ID = '123456789012345678';

function buildButton(customId: string, opts: { inGuild?: boolean } = {}) {
  const inGuild = opts.inGuild ?? true;
  const guilds = new Map<string, any>();
  guilds.set(GUILD_ID, { id: GUILD_ID, name: 'Test Guild' });

  return {
    customId,
    user: { id: 'user-1' },
    // In a DM every guild-scoped field is null — this is the shape Discord sends.
    guild: inGuild ? { id: GUILD_ID, name: 'Test Guild' } : null,
    guildId: inGuild ? GUILD_ID : null,
    channel: inGuild ? { id: 'channel-1' } : null,
    member: inGuild ? {} : null,
    client: { guilds: { cache: guilds } },
    reply: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function buildSelect(customId: string, values: string[]) {
  return {
    customId,
    values,
    user: { id: 'user-1' },
    update: jest.fn().mockResolvedValue(undefined),
  } as any;
}

describe('welcome buttons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: GUILD_ID,
      language: 'en',
      timezone: 'UTC',
    });
    (prisma.guild.update as jest.Mock).mockResolvedValue({});
  });

  describe('dispatch predicates', () => {
    it('claims its own custom IDs', () => {
      expect(isWelcomeButton(`welcome-setup:${GUILD_ID}`)).toBe(true);
      expect(isWelcomeButton(`welcome-firstraid:${GUILD_ID}`)).toBe(true);
      expect(isWelcomeSelect(`welcome-tz:${GUILD_ID}`)).toBe(true);
    });

    it('leaves the attendance and raid-create handlers alone', () => {
      expect(isWelcomeButton('raid_optin_raid1')).toBe(false);
      expect(isWelcomeButton('rcflow-confirm:d1')).toBe(false);
      expect(isWelcomeSelect('class_select_raid1')).toBe(false);
    });
  });

  describe('[Create first raid]', () => {
    // The acceptance criterion: this button starts the #38 modal flow.
    it('starts the guided raid-create flow inside a guild', async () => {
      const button = buildButton(`welcome-firstraid:${GUILD_ID}`);

      await routeWelcomeButton(button);

      expect(startGuidedRaidCreate).toHaveBeenCalledWith(
        button,
        expect.objectContaining({ date: null, time: null, title: null })
      );
    });

    // The acceptance criterion's "oder führen dort sauber zurück in den Server".
    it('points back to the server when pressed in a DM', async () => {
      const button = buildButton(`welcome-firstraid:${GUILD_ID}`, { inGuild: false });

      await routeWelcomeButton(button);

      expect(startGuidedRaidCreate).not.toHaveBeenCalled();
      const reply = button.reply.mock.calls[0][0];
      expect(reply.ephemeral).toBe(true);
      expect(reply.content).toContain('Test Guild');
      expect(reply.content).toContain('/raid create');
      // A tappable link, not just the server's name.
      expect(reply.content).toContain(`https://discord.com/channels/${GUILD_ID}`);
    });

    it('does not throw when the DM fallback cannot name the guild', async () => {
      const button = buildButton(`welcome-firstraid:${GUILD_ID}`, { inGuild: false });
      button.client.guilds.cache = new Map();

      await routeWelcomeButton(button);

      expect(button.reply).toHaveBeenCalled();
    });

    it('refuses a user who may not create raids', async () => {
      (canManageRaids as jest.Mock).mockResolvedValue(false);
      const button = buildButton(`welcome-firstraid:${GUILD_ID}`);

      await routeWelcomeButton(button);

      expect(startGuidedRaidCreate).not.toHaveBeenCalled();
      expect(button.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('permission'), ephemeral: true })
      );
    });

    // The button is pressed from a DM that could have come from any server the user
    // installed the bot into; acting on the wrong one would be worse than refusing.
    it('refuses when pressed inside a different guild than it was issued for', async () => {
      const button = buildButton('welcome-firstraid:999999999999999999');

      await routeWelcomeButton(button);

      expect(startGuidedRaidCreate).not.toHaveBeenCalled();
      expect(button.reply).toHaveBeenCalled();
    });
  });

  describe('[Start setup]', () => {
    it('asks only for the timezone — the one setting that must be right', async () => {
      const button = buildButton(`welcome-setup:${GUILD_ID}`);

      await routeWelcomeButton(button);

      const reply = button.reply.mock.calls[0][0];
      expect(reply.ephemeral).toBe(true);
      const select = reply.components[0].toJSON().components[0];
      expect(select.custom_id).toBe(`welcome-tz:${GUILD_ID}`);
      expect(select.options.length).toBeGreaterThan(0);
      // Discord's hard cap on select options.
      expect(select.options.length).toBeLessThanOrEqual(25);
    });

    // Setting a guild row needs no guild context, so this one works in a DM too.
    it('works in a DM', async () => {
      const button = buildButton(`welcome-setup:${GUILD_ID}`, { inGuild: false });

      await routeWelcomeButton(button);

      expect(button.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('mentions leader roles as optional rather than as a required step', async () => {
      const button = buildButton(`welcome-setup:${GUILD_ID}`);

      await routeWelcomeButton(button);

      const content = button.reply.mock.calls[0][0].content;
      expect(content).toContain('/config leader-roles');
      expect(content).toContain('Optional');
    });

    it('uses the guild language', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: GUILD_ID, language: 'de', timezone: 'UTC',
      });
      const button = buildButton(`welcome-setup:${GUILD_ID}`);

      await routeWelcomeButton(button);

      expect(button.reply.mock.calls[0][0].content).toContain('Zeitzone');
    });
  });

  describe('timezone select', () => {
    it('persists the chosen zone on the guild', async () => {
      const select = buildSelect(`welcome-tz:${GUILD_ID}`, ['Europe/Berlin']);

      await handleTimezoneSelect(select);

      // The deprecated timezoneOffset column rides along until phase 2 of the IANA
      // migration drops it — see guildTimezoneUpdate().
      expect(prisma.guild.update).toHaveBeenCalledWith({
        where: { id: GUILD_ID },
        data: { timezone: 'Europe/Berlin', timezoneOffset: expect.any(Number) },
      });
    });

    it('confirms and clears the menu so the step cannot be repeated by accident', async () => {
      const select = buildSelect(`welcome-tz:${GUILD_ID}`, ['Europe/Berlin']);

      await handleTimezoneSelect(select);

      const update = select.update.mock.calls[0][0];
      expect(update.components).toEqual([]);
      expect(update.content).toContain('Europe/Berlin');
    });

    it('rejects an unrecognised zone without writing', async () => {
      const select = buildSelect(`welcome-tz:${GUILD_ID}`, ['Mordor/Barad-dur']);

      await handleTimezoneSelect(select);

      expect(prisma.guild.update).not.toHaveBeenCalled();
    });
  });
});
