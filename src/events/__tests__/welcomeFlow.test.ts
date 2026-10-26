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
  handleLanguageSelect,
  handleLeaderRolesSelect,
  handleTimezoneSelect,
  isWelcomeButton,
  isWelcomeRoleSelect,
  isWelcomeSelect,
  routeWelcomeButton,
} from '../welcomeFlow';

const GUILD_ID = '123456789012345678';
const ROLE_ID = '987654321098765432';

function guildCache() {
  const guilds = new Map<string, any>();
  guilds.set(GUILD_ID, {
    id: GUILD_ID, name: 'Test Guild',
    members: { fetch: jest.fn().mockResolvedValue({ permissions: { has: () => true } }) },
  });
  return { cache: guilds };
}

function buildButton(customId: string, opts: { inGuild?: boolean } = {}) {
  const inGuild = opts.inGuild ?? true;

  return {
    customId,
    user: { id: 'user-1' },
    // In a DM every guild-scoped field is null — this is the shape Discord sends.
    guild: inGuild ? { id: GUILD_ID, name: 'Test Guild' } : null,
    guildId: inGuild ? GUILD_ID : null,
    channel: inGuild ? { id: 'channel-1' } : null,
    member: inGuild ? {} : null,
    client: { guilds: guildCache() },
    reply: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    showModal: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function buildSelect(customId: string, values: string[], opts: { inGuild?: boolean } = {}) {
  const inGuild = opts.inGuild ?? true;
  const delivery = jest.fn().mockResolvedValue(undefined);

  const interaction = {
    customId,
    values,
    user: { id: 'user-1' },
    guild: inGuild ? { id: GUILD_ID, name: 'Test Guild' } : null,
    guildId: inGuild ? GUILD_ID : null,
    client: { guilds: guildCache() },
    deferred: false,
    deferUpdate: jest.fn(async () => { interaction.deferred = true; }),
    update: delivery,
    editReply: delivery,
  } as any;
  return interaction;
}

/** The component rows of the last `update()` / `reply()` on an interaction. */
function rowsOf(call: any): any[] {
  return (call.components ?? []).map((row: any) => row.toJSON());
}

function firstComponent(call: any): any {
  return rowsOf(call)[0].components[0];
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
    (prisma.guild.update as jest.Mock).mockResolvedValue({});
  });

  it.each([
    ['timezone', handleTimezoneSelect, 'welcome-tz', ['UTC']],
    ['language', handleLanguageSelect, 'welcome-lang', ['de']],
    ['roles', handleLeaderRolesSelect, 'welcome-roles', [ROLE_ID]],
  ] as const)('requires a fresh Administrator check before the %s write', async (_name, handler, prefix, values) => {
    const select = buildSelect(`${prefix}:${GUILD_ID}`, [...values]);
    const fetch = select.client.guilds.cache.get(GUILD_ID).members.fetch;
    fetch.mockResolvedValue({ permissions: { has: () => false } });
    await handler(select);
    expect(fetch).toHaveBeenCalledWith({ user: 'user-1', force: true });
    expect(prisma.guild.update).not.toHaveBeenCalled();
    expect(select.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('Administrator') }));
  });

  it('acknowledges before membership lookup and edits the response instead of acknowledging twice', async () => {
    const select = buildSelect(`welcome-lang:${GUILD_ID}`, ['de']);
    const order: string[] = [];
    select.update = jest.fn();
    select.editReply = jest.fn().mockResolvedValue(undefined);
    select.deferUpdate.mockImplementation(async () => { order.push('ack'); select.deferred = true; });
    select.client.guilds.cache.get(GUILD_ID).members.fetch.mockImplementation(async () => {
      order.push('fetch'); return { permissions: { has: () => true } };
    });
    await handleLanguageSelect(select);
    expect(order).toEqual(['ack', 'fetch']);
    expect(select.deferUpdate).toHaveBeenCalledTimes(1);
    expect(select.update).not.toHaveBeenCalled();
    expect(select.editReply).toHaveBeenCalledTimes(1);
  });

  it('reauthorizes DM writes and refuses revoked access, foreign guild context and failed membership fetch', async () => {
    const select = buildSelect(`welcome-lang:${GUILD_ID}`, ['de'], { inGuild: false });
    const fetch = select.client.guilds.cache.get(GUILD_ID).members.fetch;
    await handleLanguageSelect(select);
    expect(prisma.guild.update).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue({ permissions: { has: () => false } });
    await handleLanguageSelect(select);
    expect(prisma.guild.update).toHaveBeenCalledTimes(1);
    fetch.mockRejectedValue(new Error('synthetic unavailable'));
    await handleLanguageSelect(select);
    expect(prisma.guild.update).toHaveBeenCalledTimes(1);
    select.guildId = 'foreign-guild';
    fetch.mockClear();
    await handleLanguageSelect(select);
    expect(fetch).not.toHaveBeenCalled();
    expect(prisma.guild.update).toHaveBeenCalledTimes(1);
  });

  describe('dispatch predicates', () => {
    it('claims its own custom IDs', () => {
      expect(isWelcomeButton(`welcome-setup:${GUILD_ID}`)).toBe(true);
      expect(isWelcomeButton(`welcome-firstraid:${GUILD_ID}`)).toBe(true);
      expect(isWelcomeButton(`welcome-skip:${GUILD_ID}:tz`)).toBe(true);
      expect(isWelcomeSelect(`welcome-tz:${GUILD_ID}`)).toBe(true);
      expect(isWelcomeSelect(`welcome-lang:${GUILD_ID}`)).toBe(true);
      expect(isWelcomeRoleSelect(`welcome-roles:${GUILD_ID}`)).toBe(true);
    });

    it('leaves the attendance and raid-create handlers alone', () => {
      expect(isWelcomeButton('raid_optin_raid1')).toBe(false);
      expect(isWelcomeButton('rcflow-confirm:d1')).toBe(false);
      expect(isWelcomeSelect('class_select_raid1')).toBe(false);
      expect(isWelcomeRoleSelect('rcflow-roles:d1')).toBe(false);
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

  describe('[Start setup] — step 1, timezone', () => {
    it('opens with the timezone picker and a skip button', async () => {
      const button = buildButton(`welcome-setup:${GUILD_ID}`);

      await routeWelcomeButton(button);

      const reply = button.reply.mock.calls[0][0];
      expect(reply.ephemeral).toBe(true);
      const select = firstComponent(reply);
      expect(select.custom_id).toBe(`welcome-tz:${GUILD_ID}`);
      expect(select.options.length).toBeGreaterThan(0);
      // Discord's hard cap on select options.
      expect(select.options.length).toBeLessThanOrEqual(25);

      // Every step is skippable — that is what keeps the chain non-blocking.
      const skip = rowsOf(reply)[1].components[0];
      expect(skip.custom_id).toBe(`welcome-skip:${GUILD_ID}:tz`);
    });

    it('announces itself as step 1 of 3', async () => {
      const button = buildButton(`welcome-setup:${GUILD_ID}`);

      await routeWelcomeButton(button);

      expect(button.reply.mock.calls[0][0].content).toContain('Step 1 of 3');
    });

    // Setting a guild row needs no guild context, so this one works in a DM too.
    it('works in a DM', async () => {
      const button = buildButton(`welcome-setup:${GUILD_ID}`, { inGuild: false });

      await routeWelcomeButton(button);

      expect(button.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true })
      );
    });

    it('uses the guild language', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: GUILD_ID, language: 'de', timezone: 'UTC',
      });
      const button = buildButton(`welcome-setup:${GUILD_ID}`);

      await routeWelcomeButton(button);

      expect(button.reply.mock.calls[0][0].content).toContain('Zeitzone');
    });

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

    it('confirms the zone and moves on to the language step', async () => {
      const select = buildSelect(`welcome-tz:${GUILD_ID}`, ['Europe/Berlin']);

      await handleTimezoneSelect(select);

      const update = select.update.mock.calls[0][0];
      expect(update.content).toContain('Europe/Berlin');
      expect(update.content).toContain('Step 2 of 3');
      expect(firstComponent(update).custom_id).toBe(`welcome-lang:${GUILD_ID}`);
    });

    it('rejects an unrecognised zone without writing', async () => {
      const select = buildSelect(`welcome-tz:${GUILD_ID}`, ['Mordor/Barad-dur']);

      await handleTimezoneSelect(select);

      expect(prisma.guild.update).not.toHaveBeenCalled();
    });

    it('skips to the language step without writing a timezone', async () => {
      const button = buildButton(`welcome-skip:${GUILD_ID}:tz`);

      await routeWelcomeButton(button);

      expect(prisma.guild.update).not.toHaveBeenCalled();
      const update = button.update.mock.calls[0][0];
      expect(update.content).toContain('Step 2 of 3');
      expect(firstComponent(update).custom_id).toBe(`welcome-lang:${GUILD_ID}`);
    });
  });

  describe('step 2 — language', () => {
    it('preselects the language guessed at guild-create time', async () => {
      const select = buildSelect(`welcome-tz:${GUILD_ID}`, ['Europe/Berlin']);

      await handleTimezoneSelect(select);

      const options = firstComponent(select.update.mock.calls[0][0]).options;
      expect(options.map((o: any) => o.value)).toEqual(['en', 'de']);
      expect(options.find((o: any) => o.value === 'en').default).toBe(true);
    });

    it('writes the language through the /config update-only path', async () => {
      const select = buildSelect(`welcome-lang:${GUILD_ID}`, ['de']);

      await handleLanguageSelect(select);

      expect(prisma.guild.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUILD_ID },
          data: { language: 'de' },
        })
      );
    });

    // Acceptance criterion: the choice takes effect for the remaining steps, not
    // only for the next raid message.
    it('renders the following step in the language just chosen', async () => {
      const select = buildSelect(`welcome-lang:${GUILD_ID}`, ['de']);

      await handleLanguageSelect(select);

      const content = select.update.mock.calls[0][0].content;
      expect(content).toContain('Sprache auf **Deutsch** gesetzt');
      expect(content).toContain('Schritt 3 von 3');
      expect(content).not.toContain('Step 3 of 3');
    });

    it('skips to the leader-role step keeping the current language', async () => {
      const button = buildButton(`welcome-skip:${GUILD_ID}:lang`);

      await routeWelcomeButton(button);

      expect(prisma.guild.update).not.toHaveBeenCalled();
      const update = button.update.mock.calls[0][0];
      expect(update.content).toContain('Step 3 of 3');
      expect(firstComponent(update).custom_id).toBe(`welcome-roles:${GUILD_ID}`);
    });
  });

  describe('step 3 — leader roles', () => {
    it('offers a role select inside a guild', async () => {
      const select = buildSelect(`welcome-lang:${GUILD_ID}`, ['en']);

      await handleLanguageSelect(select);

      const roleSelect = firstComponent(select.update.mock.calls[0][0]);
      expect(roleSelect.custom_id).toBe(`welcome-roles:${GUILD_ID}`);
      // Zero is allowed: an empty submit means "keep the default", same as [Skip].
      expect(roleSelect.min_values).toBe(0);
    });

    // The DM fallstrick: a RoleSelectMenu has no guild to resolve roles against, so
    // the chain has to end with a pointer instead of an empty menu.
    it('points into the server instead of showing a role menu in a DM', async () => {
      const select = buildSelect(`welcome-lang:${GUILD_ID}`, ['en'], { inGuild: false });

      await handleLanguageSelect(select);

      const update = select.update.mock.calls[0][0];
      expect(update.components).toEqual([]);
      expect(update.content).toContain('/config leader-roles');
      expect(update.content).toContain('Test Guild');
      expect(update.content).toContain(`https://discord.com/channels/${GUILD_ID}`);
    });

    // Same guard as [Create first raid]: a DM button could come from any server the
    // user installed the bot into.
    it('rejects a setup write from a different guild before changing the target server', async () => {
      const select = buildSelect('welcome-lang:999999999999999999', ['en']);

      await handleLanguageSelect(select);

      const update = select.update.mock.calls[0][0];
      expect(update.components).toEqual([]);
      expect(update.content).toContain('Administrator');
      expect(prisma.guild.update).not.toHaveBeenCalled();
    });

    it('stores the picked roles as IDs through the /config update-only path', async () => {
      const select = buildSelect(`welcome-roles:${GUILD_ID}`, [ROLE_ID]);

      await handleLeaderRolesSelect(select);

      expect(prisma.guild.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GUILD_ID },
          data: { raidLeaderRoles: ROLE_ID },
        })
      );
    });

    // Acceptance criterion: leaving it empty must behave exactly as before.
    it('writes nothing when no role is picked', async () => {
      const select = buildSelect(`welcome-roles:${GUILD_ID}`, []);

      await handleLeaderRolesSelect(select);

      expect(prisma.guild.update).not.toHaveBeenCalled();
      expect(select.update.mock.calls[0][0].content).toContain('Manage Events');
    });

    it('writes nothing when the step is skipped', async () => {
      const button = buildButton(`welcome-skip:${GUILD_ID}:roles`);

      await routeWelcomeButton(button);

      expect(prisma.guild.update).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('closes the chain with the stored settings and points at /config view', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: GUILD_ID,
        language: 'en',
        timezone: 'Europe/Berlin',
        raidLeaderRoles: ROLE_ID,
      });
      const select = buildSelect(`welcome-roles:${GUILD_ID}`, [ROLE_ID]);

      await handleLeaderRolesSelect(select);

      const update = select.update.mock.calls[0][0];
      expect(update.components).toEqual([]);
      expect(update.content).toContain('Europe/Berlin');
      expect(update.content).toContain('English');
      expect(update.content).toContain(`<@&${ROLE_ID}>`);
      expect(update.content).toContain('/config view');
    });

    // A skipped step must show what was already stored, not a blank.
    it('reports the pre-existing timezone after a skipped first step', async () => {
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: GUILD_ID,
        language: 'en',
        timezone: 'America/New_York',
        raidLeaderRoles: '',
      });
      const button = buildButton(`welcome-skip:${GUILD_ID}:roles`);

      await routeWelcomeButton(button);

      expect(button.update.mock.calls[0][0].content).toContain('America/New_York');
    });
  });
});
