/**
 * Tests for the guided `/raid create` flow (issue #38).
 *
 * Walks the acceptance criteria: modal on an empty invocation, role select after
 * submit, preview with Discord timestamps, the time/timezone correction path, and
 * clean handling of the two ways a user can walk away (expired draft, foreign draft).
 */

jest.mock('../../database/client');
jest.mock('../../utils/permissions');
// Only the write is stubbed. `buildRoleMentions` is a pure resolver over the guild's
// role cache and the preview's ping line is only worth asserting against the real
// one — a hand-written stand-in would drift from it.
jest.mock('../../commands/raid', () => ({
  ...jest.requireActual('../../commands/raid'),
  createRaidWithRoster: jest.fn().mockResolvedValue(true),
}));

import prisma from '../../database/client';
import { canManageRaids } from '../../utils/permissions';
import { createRaidWithRoster } from '../../commands/raid';
import {
  __clearDrafts,
  handleConfirmButton,
  handleDetailsSubmit,
  handleFixTimeButton,
  handleFixTimeSubmit,
  handlePingToggle,
  handleRoleSelect,
  isFlowButton,
  isFlowModal,
  isFlowRoleSelect,
  startGuidedRaidCreate,
} from '../raidCreateFlow';

const GUILD_ID = 'guild-123';
const USER_ID = 'user-leader';
const CHANNEL_ID = 'channel-123';

/** A date comfortably in the future so "must be in the future" never trips. */
function futureDate(daysFromNow = 30): string {
  const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function buildSlashInteraction(overrides: Record<string, any> = {}) {
  return {
    guild: { id: GUILD_ID, name: 'Test Guild' },
    guildId: GUILD_ID,
    channel: { id: CHANNEL_ID },
    user: { id: USER_ID },
    member: {},
    showModal: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function buildModalInteraction(customId: string, fields: Record<string, string>, userId = USER_ID) {
  return {
    customId,
    user: { id: userId },
    guildId: GUILD_ID,
    fields: {
      getTextInputValue: (key: string) => {
        if (!(key in fields)) throw new Error(`no field ${key}`);
        return fields[key];
      },
    },
    isModalSubmit: () => true,
    reply: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function buildRoleSelectInteraction(customId: string, values: string[], userId = USER_ID) {
  return {
    customId,
    values,
    user: { id: userId },
    guildId: GUILD_ID,
    guild: { id: GUILD_ID, roles: roleCache() },
    isModalSubmit: () => false,
    update: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  } as any;
}

/**
 * Role cache the preview resolves mentions against — `buildRoleMentions` drops role
 * ids the guild does not know, so the fixture has to carry them.
 */
function roleCache() {
  const roles = new Map<string, any>();
  roles.set('role-a', { id: 'role-a', name: 'Raider' });
  roles.set('role-b', { id: 'role-b', name: 'Trial' });
  return { cache: Object.assign(roles, { find: (fn: any) => [...roles.values()].find(fn) }) };
}

function buildButtonInteraction(customId: string, userId = USER_ID) {
  const channelCache = new Map<string, any>();
  channelCache.set(CHANNEL_ID, { id: CHANNEL_ID, send: jest.fn() });

  return {
    customId,
    user: { id: userId },
    guildId: GUILD_ID,
    member: {},
    guild: { id: GUILD_ID, channels: { cache: channelCache }, roles: roleCache() },
    isModalSubmit: () => false,
    showModal: jest.fn().mockResolvedValue(undefined),
    deferUpdate: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
  } as any;
}

/** Extracts the draft id a step handed to the next one via its custom ID. */
function draftIdFromModal(interaction: any): string {
  const modal = interaction.showModal.mock.calls[0][0].toJSON();
  return modal.custom_id.split(':')[1];
}

/** Drives modal -> role select and returns the draft id plus both interactions. */
async function runToRoleSelect(date = futureDate(), time = '20:00', title = 'Heroic Night') {
  const slash = buildSlashInteraction();
  await startGuidedRaidCreate(slash, {
    date: null,
    time: null,
    title: null,
    roles: null,
    pingRoles: false,
    teamOption: null,
  });

  const draftId = draftIdFromModal(slash);
  const modal = buildModalInteraction(`rcflow-details:${draftId}`, { title, date, time });
  await handleDetailsSubmit(modal);

  return { draftId, slash, modal };
}

describe('guided /raid create flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearDrafts();
    (canManageRaids as jest.Mock).mockResolvedValue(true);
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
      id: GUILD_ID,
      name: 'Test Guild',
      language: 'en',
      timezone: 'Europe/Berlin',
    });
    (prisma.guild.update as jest.Mock).mockResolvedValue({});
  });

  describe('step 1 — the modal', () => {
    it('opens a modal with exactly the three text fields Discord allows here', async () => {
      const slash = buildSlashInteraction();

      await startGuidedRaidCreate(slash, {
        date: null,
        time: null,
        title: null,
        roles: null,
        pingRoles: false,
        teamOption: null,
      });

      expect(slash.showModal).toHaveBeenCalled();
      const modal = slash.showModal.mock.calls[0][0].toJSON();
      const fieldIds = modal.components.map((row: any) => row.components[0].custom_id);
      expect(fieldIds).toEqual(['title', 'date', 'time']);
    });

    // Acceptance criterion: partially filled options must pre-fill, not error.
    it('pre-fills the modal from partially supplied slash options', async () => {
      const slash = buildSlashInteraction();

      await startGuidedRaidCreate(slash, {
        date: null,
        time: null,
        title: 'Mythic Prog',
        roles: null,
        pingRoles: false,
        teamOption: null,
      });

      const modal = slash.showModal.mock.calls[0][0].toJSON();
      const values = Object.fromEntries(
        modal.components.map((row: any) => [row.components[0].custom_id, row.components[0].value])
      );
      expect(values.title).toBe('Mythic Prog');
      // The untouched fields still get a usable default rather than being blank.
      expect(values.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(values.time).toBe('20:00');
    });

    it('suggests a future default time, never one already past', async () => {
      const slash = buildSlashInteraction();

      await startGuidedRaidCreate(slash, {
        date: null, time: null, title: null, roles: null, pingRoles: false, teamOption: null,
      });

      const modal = slash.showModal.mock.calls[0][0].toJSON();
      const values = Object.fromEntries(
        modal.components.map((row: any) => [row.components[0].custom_id, row.components[0].value])
      );
      // Submitting the untouched defaults must pass the "must be in the future" check.
      const submit = buildModalInteraction(`rcflow-details:${draftIdFromModal(slash)}`, {
        title: 'Raid',
        date: values.date,
        time: values.time,
      });
      await handleDetailsSubmit(submit);

      const content = submit.reply.mock.calls[0][0].content;
      expect(content).not.toContain('in the past');
    });

    it('labels the time field with the guild zone so the input is unambiguous', async () => {
      const slash = buildSlashInteraction();

      await startGuidedRaidCreate(slash, {
        date: null, time: null, title: null, roles: null, pingRoles: false, teamOption: null,
      });

      const modal = slash.showModal.mock.calls[0][0].toJSON();
      const timeField = modal.components[2].components[0];
      expect(timeField.label).toContain('Europe/Berlin');
    });

    it('refuses outside a guild instead of opening a modal', async () => {
      const slash = buildSlashInteraction({ guild: null });

      await startGuidedRaidCreate(slash, {
        date: null, time: null, title: null, roles: null, pingRoles: false, teamOption: null,
      });

      expect(slash.showModal).not.toHaveBeenCalled();
      expect(slash.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('server'), ephemeral: true })
      );
    });
  });

  describe('step 2 — role select', () => {
    it('follows the modal with a role select menu', async () => {
      const { draftId, modal } = await runToRoleSelect();

      const payload = modal.reply.mock.calls[0][0];
      const component = payload.components[0].toJSON().components[0];
      expect(component.type).toBe(6); // ROLE_SELECT
      expect(component.custom_id).toBe(`rcflow-roles:${draftId}`);
      expect(payload.ephemeral).toBe(true);
    });

    it('rejects an invalid date without losing the user in a stack trace', async () => {
      const slash = buildSlashInteraction();
      await startGuidedRaidCreate(slash, {
        date: null, time: null, title: null, roles: null, pingRoles: false, teamOption: null,
      });
      const modal = buildModalInteraction(`rcflow-details:${draftIdFromModal(slash)}`, {
        title: 'Raid',
        date: 'next tuesday',
        time: '20:00',
      });

      await handleDetailsSubmit(modal);

      expect(modal.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not a valid date') })
      );
    });

    it('rejects a date in the past', async () => {
      const slash = buildSlashInteraction();
      await startGuidedRaidCreate(slash, {
        date: null, time: null, title: null, roles: null, pingRoles: false, teamOption: null,
      });
      const modal = buildModalInteraction(`rcflow-details:${draftIdFromModal(slash)}`, {
        title: 'Raid',
        date: '2020-01-01',
        time: '20:00',
      });

      await handleDetailsSubmit(modal);

      expect(modal.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('in the past') })
      );
    });
  });

  describe('step 3 — the preview', () => {
    it('renders both Discord timestamp forms and the chosen roles', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a', 'role-b']);

      await handleRoleSelect(select);

      const embed = select.update.mock.calls[0][0].embeds[0].toJSON();
      // Acceptance criterion: absolute *and* relative timestamp.
      expect(embed.description).toMatch(/<t:\d+:F>/);
      expect(embed.description).toMatch(/<t:\d+:R>/);
      expect(embed.description).toContain('<@&role-a>');
      expect(embed.description).toContain('<@&role-b>');
    });

    it('names the zone the time was entered in, so a wrong zone is visible', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);

      await handleRoleSelect(select);

      const embed = select.update.mock.calls[0][0].embeds[0].toJSON();
      expect(embed.description).toContain('Europe/Berlin');
    });

    it('offers a confirm, a correct-time and a ping button', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);

      await handleRoleSelect(select);

      const buttons = select.update.mock.calls[0][0].components[0].toJSON().components;
      expect(buttons.map((b: any) => b.custom_id)).toEqual([
        `rcflow-confirm:${draftId}`,
        `rcflow-fixtime:${draftId}`,
        `rcflow-ping:${draftId}`,
      ]);
    });

    it('starts with the ping off — unchanged behaviour for the guided path', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);

      await handleRoleSelect(select);

      const update = select.update.mock.calls[0][0];
      const pingButton = update.components[0].toJSON().components[2];
      expect(pingButton.label).toBe('Ping: off');
      expect(pingButton.disabled).toBe(false);
      expect(update.embeds[0].toJSON().description).toContain('No ping');
    });

    it('converts the typed time using the guild zone, with DST applied', async () => {
      // Same wall-clock time, opposite seasons: the rendered unix timestamps must
      // differ by the DST hour, not by a fixed offset.
      (prisma.guild.findUnique as jest.Mock).mockResolvedValue({
        id: GUILD_ID, language: 'en', timezone: 'Europe/Berlin',
      });

      const unixFor = async (date: string) => {
        __clearDrafts();
        const { draftId } = await runToRoleSelect(date, '20:00');
        const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);
        await handleRoleSelect(select);
        const embed = select.update.mock.calls[0][0].embeds[0].toJSON();
        return Number(embed.description.match(/<t:(\d+):F>/)[1]);
      };

      const winter = await unixFor('2035-01-17');
      const summer = await unixFor('2035-07-17');

      expect(new Date(winter * 1000).toISOString()).toBe('2035-01-17T19:00:00.000Z'); // CET
      expect(new Date(summer * 1000).toISOString()).toBe('2035-07-17T18:00:00.000Z'); // CEST
    });
  });

  // Issue #49: the guided path could pick roles but not decide whether they get
  // notified — the question only becomes answerable once the roles are chosen.
  describe('step 3b — the ping toggle', () => {
    /** Runs the flow up to a preview with the given roles and returns the draft id. */
    async function runToPreview(roles: string[] = ['role-a']) {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, roles);
      await handleRoleSelect(select);
      return { draftId, select };
    }

    it('flips the draft and re-renders the preview with the actual mentions', async () => {
      const { draftId } = await runToPreview(['role-a', 'role-b']);
      const button = buildButtonInteraction(`rcflow-ping:${draftId}`);

      await handlePingToggle(button);

      const update = button.update.mock.calls[0][0];
      expect(update.components[0].toJSON().components[2].label).toBe('Ping: on');
      const description = update.embeds[0].toJSON().description;
      expect(description).toContain('pinged');
      expect(description).toContain('<@&role-a>');
      expect(description).toContain('<@&role-b>');
    });

    it('flips back off on a second press', async () => {
      const { draftId } = await runToPreview();

      await handlePingToggle(buildButtonInteraction(`rcflow-ping:${draftId}`));
      const second = buildButtonInteraction(`rcflow-ping:${draftId}`);
      await handlePingToggle(second);

      expect(second.update.mock.calls[0][0].components[0].toJSON().components[2].label).toBe(
        'Ping: off'
      );
    });

    // Acceptance criterion: the slash option still sets the prefill and arrives as "on".
    it('shows "on" when ping_roles:true came in on the command line', async () => {
      const slash = buildSlashInteraction();
      await startGuidedRaidCreate(slash, {
        date: null,
        time: null,
        title: null,
        roles: null,
        pingRoles: true,
        teamOption: null,
      });

      const draftId = draftIdFromModal(slash);
      await handleDetailsSubmit(
        buildModalInteraction(`rcflow-details:${draftId}`, {
          title: 'Heroic Night',
          date: futureDate(),
          time: '20:00',
        })
      );
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);
      await handleRoleSelect(select);

      const update = select.update.mock.calls[0][0];
      expect(update.components[0].toJSON().components[2].label).toBe('Ping: on');
      expect(update.embeds[0].toJSON().description).toContain('pinged');
    });

    // Acceptance criterion: without roles the toggle must not be operable — disabled
    // rather than clickable-but-inconsequential.
    it('renders disabled and refuses to flip when no role was picked', async () => {
      const { draftId, select } = await runToPreview([]);

      expect(select.update.mock.calls[0][0].components[0].toJSON().components[2].disabled).toBe(
        true
      );

      const button = buildButtonInteraction(`rcflow-ping:${draftId}`);
      await handlePingToggle(button);

      expect(button.deferUpdate).toHaveBeenCalled();
      expect(button.update).not.toHaveBeenCalled();
    });

    // The whole point: the flag has to survive to the post, not just to the preview.
    it('carries through to the created raid', async () => {
      const { draftId } = await runToPreview();

      await handlePingToggle(buildButtonInteraction(`rcflow-ping:${draftId}`));
      await handleConfirmButton(buildButtonInteraction(`rcflow-confirm:${draftId}`));

      expect(createRaidWithRoster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pingRoles: true, roleIds: ['role-a'] })
      );
    });

    it('posts without the ping when the toggle was never touched', async () => {
      const { draftId } = await runToPreview();

      await handleConfirmButton(buildButtonInteraction(`rcflow-confirm:${draftId}`));

      expect(createRaidWithRoster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pingRoles: false })
      );
    });

    it('clears the stale preview when the draft has expired', async () => {
      const button = buildButtonInteraction('rcflow-ping:doesnotexist');

      await handlePingToggle(button);

      expect(button.update).toHaveBeenCalledWith(
        expect.objectContaining({ components: [], embeds: [] })
      );
    });

    // A custom ID is visible to anyone who can see the message.
    it('ignores a toggle pressed by someone else', async () => {
      const { draftId } = await runToPreview();
      const button = buildButtonInteraction(`rcflow-ping:${draftId}`, 'someone-else');

      await handlePingToggle(button);

      expect(button.update).toHaveBeenCalledWith(
        expect.objectContaining({ components: [], embeds: [] })
      );
    });
  });

  describe('step 4 — fix time / timezone', () => {
    it('opens a modal pre-filled with the current draft and guild zone', async () => {
      const { draftId } = await runToRoleSelect();
      const button = buildButtonInteraction(`rcflow-fixtime:${draftId}`);

      await handleFixTimeButton(button);

      const modal = button.showModal.mock.calls[0][0].toJSON();
      const values = Object.fromEntries(
        modal.components.map((row: any) => [row.components[0].custom_id, row.components[0].value])
      );
      expect(values.timezone).toBe('Europe/Berlin');
      expect(values.time).toBe('20:00');
    });

    // Acceptance criterion: correcting the time persists the guild zone, so the
    // next raid is right without anyone visiting /config.
    it('persists the corrected zone on the guild', async () => {
      const { draftId } = await runToRoleSelect();
      const submit = buildModalInteraction(`rcflow-fixtime-modal:${draftId}`, {
        date: futureDate(),
        time: '20:00',
        timezone: 'America/New_York',
      });

      await handleFixTimeSubmit(submit);

      // The deprecated timezoneOffset column rides along until phase 2 of the IANA
      // migration drops it — see guildTimezoneUpdate().
      expect(prisma.guild.update).toHaveBeenCalledWith({
        where: { id: GUILD_ID },
        data: { timezone: 'America/New_York', timezoneOffset: expect.any(Number) },
      });
    });

    it('rejects an unknown zone without touching the guild row', async () => {
      const { draftId } = await runToRoleSelect();
      const submit = buildModalInteraction(`rcflow-fixtime-modal:${draftId}`, {
        date: futureDate(),
        time: '20:00',
        timezone: 'Mordor/Barad-dur',
      });

      await handleFixTimeSubmit(submit);

      expect(prisma.guild.update).not.toHaveBeenCalled();
      expect(submit.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('not a known timezone') })
      );
    });

    it('re-renders the preview after a successful correction', async () => {
      const { draftId } = await runToRoleSelect();
      const submit = buildModalInteraction(`rcflow-fixtime-modal:${draftId}`, {
        date: futureDate(),
        time: '21:30',
        timezone: 'Europe/Berlin',
      });

      await handleFixTimeSubmit(submit);

      const embed = submit.reply.mock.calls[0][0].embeds[0].toJSON();
      expect(embed.description).toMatch(/<t:\d+:F>/);
    });
  });

  describe('step 5 — confirm', () => {
    async function runToPreview() {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);
      await handleRoleSelect(select);
      return draftId;
    }

    it('creates the raid through the same path as the one-line command', async () => {
      const draftId = await runToPreview();
      const button = buildButtonInteraction(`rcflow-confirm:${draftId}`);

      await handleConfirmButton(button);

      expect(createRaidWithRoster).toHaveBeenCalledWith(
        button,
        expect.objectContaining({
          title: 'Heroic Night',
          roleIds: ['role-a'],
          createdBy: USER_ID,
        })
      );
    });

    // A double-click on an ephemeral button is easy; two raids from one flow is not
    // acceptable, so the draft is consumed before the write.
    it('creates only one raid when the confirm button is clicked twice', async () => {
      const draftId = await runToPreview();

      await handleConfirmButton(buildButtonInteraction(`rcflow-confirm:${draftId}`));
      await handleConfirmButton(buildButtonInteraction(`rcflow-confirm:${draftId}`));

      expect(createRaidWithRoster).toHaveBeenCalledTimes(1);
    });

    it('re-checks permissions at confirm time, not just at command time', async () => {
      const draftId = await runToPreview();
      // The user lost their leader role while the preview was on screen.
      (canManageRaids as jest.Mock).mockResolvedValue(false);
      const button = buildButtonInteraction(`rcflow-confirm:${draftId}`);

      await handleConfirmButton(button);

      expect(createRaidWithRoster).not.toHaveBeenCalled();
      expect(button.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('permission') })
      );
    });

    it('refuses when the raid time has slipped into the past', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);
      await handleRoleSelect(select);

      // Simulate the clock moving past the raid by rewriting the draft through the
      // correction path is not possible (it validates too), so assert via a draft
      // whose date was valid at entry: jump the clock instead.
      const realNow = Date.now;
      Date.now = () => realNow() + 400 * 24 * 60 * 60 * 1000;
      try {
        const button = buildButtonInteraction(`rcflow-confirm:${draftId}`);
        await handleConfirmButton(button);
        expect(createRaidWithRoster).not.toHaveBeenCalled();
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe('abandoned and hijacked flows', () => {
    it('tells the user plainly when the draft has expired', async () => {
      const modal = buildModalInteraction('rcflow-details:doesnotexist', {
        title: 'Raid',
        date: futureDate(),
        time: '20:00',
      });

      await handleDetailsSubmit(modal);

      expect(modal.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('expired') })
      );
    });

    it('clears the stale components when an expired draft is confirmed', async () => {
      const button = buildButtonInteraction('rcflow-confirm:doesnotexist');

      await handleConfirmButton(button);

      expect(button.update).toHaveBeenCalledWith(
        expect.objectContaining({ components: [], embeds: [] })
      );
      expect(createRaidWithRoster).not.toHaveBeenCalled();
    });

    // Custom IDs are visible to anyone who can read the message.
    it('refuses to act on another user\'s draft', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a'], 'someone-else');

      await handleRoleSelect(select);

      expect(select.update).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('expired') })
      );
    });

    it('does not create a raid from another user\'s confirm click', async () => {
      const { draftId } = await runToRoleSelect();
      const select = buildRoleSelectInteraction(`rcflow-roles:${draftId}`, ['role-a']);
      await handleRoleSelect(select);

      await handleConfirmButton(buildButtonInteraction(`rcflow-confirm:${draftId}`, 'someone-else'));

      expect(createRaidWithRoster).not.toHaveBeenCalled();
    });
  });

  describe('dispatch predicates', () => {
    it('claims its own custom IDs', () => {
      expect(isFlowModal('rcflow-details:d1')).toBe(true);
      expect(isFlowModal('rcflow-fixtime-modal:d1')).toBe(true);
      expect(isFlowButton('rcflow-confirm:d1')).toBe(true);
      expect(isFlowButton('rcflow-fixtime:d1')).toBe(true);
      expect(isFlowRoleSelect('rcflow-roles:d1')).toBe(true);
    });

    it('leaves the existing attendance handlers alone', () => {
      // These belong to buttonHandler/selectHandler and must not be intercepted.
      expect(isFlowModal('optout_reason_raid1_user1')).toBe(false);
      expect(isFlowButton('raid_optin_raid1')).toBe(false);
      expect(isFlowButton('raid_optout_raid1')).toBe(false);
      expect(isFlowRoleSelect('class_select_raid1')).toBe(false);
    });

    // Draft ids must survive the `split('_')` convention used by the older handlers.
    it('generates draft ids free of underscores', async () => {
      const slash = buildSlashInteraction();
      await startGuidedRaidCreate(slash, {
        date: null, time: null, title: null, roles: null, pingRoles: false, teamOption: null,
      });

      expect(draftIdFromModal(slash)).not.toContain('_');
    });
  });
});
