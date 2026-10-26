jest.mock('../database/client');
import { Collection } from 'discord.js';
import prisma from '../database/client';
import { createGuildRuntime } from '../services/guildRuntime';
import { bindGuildCustomId, readGuildCustomId, guildOutput, currentGuildJobToken } from '../services/guildJobs';
import { runGuildInteraction } from '../events/guildInteraction';
import { buildRaidButtonRows } from '../utils/raidComponents';
import { buildWelcomeMessage } from '../utils/welcomeEmbed';
import { handleButton, handleModalSubmit } from '../events/buttonHandler';
import { handleSelectMenu } from '../events/selectHandler';
import { routeWelcomeButton, routeWelcomeSelect, handleLeaderRolesSelect } from '../events/welcomeFlow';
import setup from '../commands/setup';

const original = () => ({ id: 'callback-guild', name: 'Synthetic' });
function input(id: string, administrator = true, dm = false): any {
  const member = { guild: { id: original().id }, displayName: 'Synthetic', permissions: { has: () => administrator }, roles: { cache: new Collection() } };
  const guild = { ...original(), members: { fetch: jest.fn().mockResolvedValue(member) } };
  const i: any = { customId: id, guildId: dm ? null : guild.id, guild: dm ? null : guild, client: { guilds: { cache: new Collection([[guild.id, guild]]) } },
    user: { id: 'actor' }, locale: 'en-US', replied: false, deferred: false,
    isChatInputCommand: () => false, isAutocomplete: () => false,
    reply: jest.fn(async () => { i.replied = true; }), editReply: jest.fn(), update: jest.fn(), showModal: jest.fn(),
    deferReply: jest.fn(async () => { i.deferred = true; }), deferUpdate: jest.fn(async () => { i.deferred = true; }),
  }; return i;
}
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.guild.upsert as jest.Mock).mockResolvedValue({}); (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ language: 'en', premiumTier: 'PREMIUM', raidLeaderRoles: '', timezone: 'UTC' });
});
function gate() { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; }

it('publishes signed actual raid buttons, rejects raw/tampered/prior-process IDs and never stamps a callback', async () => {
  const runtime = createGuildRuntime(); const token = (await runtime.join(original()))!;
  const rows = (await runtime.jobs.runWithToken(token, async () => buildRaidButtonRows('synthetic-raid', 'en')))!;
  const id = (rows[0].toJSON().components[0] as any).custom_id!;
  expect(readGuildCustomId(id)).toEqual({ token, customId: 'raid_optin_synthetic-raid' });
  const dispatch = jest.fn();
  for (const bad of ['raid_optin_synthetic-raid', id.replace('optin', 'optout')]) await runGuildInteraction(runtime, input(bad), dispatch);
  expect(dispatch).not.toHaveBeenCalled();
  const restartedRuntime = createGuildRuntime(); await restartedRuntime.join(original());
  await runGuildInteraction(restartedRuntime, input(id), dispatch); expect(dispatch).not.toHaveBeenCalled();
  jest.isolateModules(() => { const restarted = require('../services/guildJobs'); expect(restarted.readGuildCustomId(id)).toBeUndefined(); });
  await runGuildInteraction(runtime, input(id), async i => { expect(i).toHaveProperty('customId', 'raid_optin_synthetic-raid'); expect(runtime.jobs.current()?.token).toBe(token); });
});

it('keeps actual premium optout modal first, signs its original issuance and rejects it after rejoin', async () => {
  const runtime = createGuildRuntime(); const guild = original(); const token = (await runtime.join(guild))!;
  const id = (await runtime.jobs.runWithToken(token, async () => (buildRaidButtonRows('synthetic-raid', 'en')[0].toJSON().components[2] as any).custom_id))!;
  const i = input(id); await runGuildInteraction(runtime, i, x => handleButton(x as any));
  expect(i.deferReply).not.toHaveBeenCalled(); expect(i.showModal).toHaveBeenCalledTimes(1);
  const modalId = i.showModal.mock.calls[0][0].toJSON().custom_id;
  expect(readGuildCustomId(modalId)).toEqual({ token, customId: 'optout_reason_synthetic-raid_actor' });
  await runtime.depart(guild); await runtime.join(original());
  const stale = input(modalId); await runGuildInteraction(runtime, stale, x => handleModalSubmit(x as any));
  expect(prisma.raidAttendance.update).not.toHaveBeenCalled(); expect(stale.deferReply).not.toHaveBeenCalled();
});

it('binds actual class/spec publication and admits only current guild membership', async () => {
  const runtime = createGuildRuntime(); const token = (await runtime.join(original()))!;
  const id = (await runtime.jobs.runWithToken(token, async () => bindGuildCustomId('class_select_synthetic-raid')))!;
  const i = input(id, false); i.values = ['Warrior'];
  await runGuildInteraction(runtime, i, x => handleSelectMenu(x as any));
  const spec = i.update.mock.calls[0][0].components[0].toJSON().components[0].custom_id;
  expect(readGuildCustomId(spec)?.token).toBe(token);
  expect(readGuildCustomId(spec)?.customId).toBe('spec_select_synthetic-raid_Warrior');
  const denied = input(spec); denied.guild.members.fetch.mockRejectedValue(new Error('not a member'));
  await runGuildInteraction(runtime, denied, x => handleSelectMenu(x as any));
  expect(prisma.userPreference.upsert).not.toHaveBeenCalled();
});

it('reauthorizes actual DM welcome setup and actual timezone/leader selects inside the original job', async () => {
  const runtime = createGuildRuntime(); const token = (await runtime.join(original()))!;
  const welcome = (await runtime.jobs.runWithToken(token, async () => buildWelcomeMessage({ guildId: token.guildId, language: 'en', trialGranted: false })))!;
  const id = (welcome.components[0].toJSON().components[0] as any).custom_id!;
  const denied = input(id, false, true); await runGuildInteraction(runtime, denied, x => routeWelcomeButton(x as any)); expect(denied.update).not.toHaveBeenCalled();
  const allowed = input(id, true, true); await runGuildInteraction(runtime, allowed, x => routeWelcomeButton(x as any));
  const menuId = allowed.reply.mock.calls[0][0].components[0].toJSON().components[0].custom_id;
  const tz = input(menuId, true, true); tz.values = ['Europe/Berlin'];
  await runGuildInteraction(runtime, tz, x => routeWelcomeSelect(x as any));
  expect(tz.deferUpdate).toHaveBeenCalled(); expect(prisma.guild.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ timezone: 'Europe/Berlin' }) }));
  const rolesId = (await runtime.jobs.runWithToken(token, async () => bindGuildCustomId(`welcome-roles:${token.guildId}`)))!;
  const roles = input(rolesId, true); roles.values = ['role']; roles.guild.roles = { cache: new Collection([['role', { id: 'role', name: 'Leader' }]]) };
  await runGuildInteraction(runtime, roles, x => handleLeaderRolesSelect(x as any));
  expect(prisma.guild.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ raidLeaderRoles: 'role' }) }));
});

it('reissues setup UI only through a fresh Administrator slash action', async () => {
  const runtime = createGuildRuntime(); const token = (await runtime.join(original()))!;
  const i = input(''); delete i.customId; i.commandName = 'setup'; i.isChatInputCommand = () => true;
  await runGuildInteraction(runtime, i, x => setup.execute(x as any));
  const rows = i.editReply.mock.calls[0][0].components;
  expect(readGuildCustomId(rows[0].toJSON().components[0].custom_id)?.token).toBe(token);
  const denied = input('', false); delete denied.customId; denied.commandName = 'setup'; denied.isChatInputCommand = () => true;
  await runGuildInteraction(runtime, denied, x => setup.execute(x as any)); expect(denied.editReply).not.toHaveBeenCalled();
});

it('rejects delayed callback authorization and delayed output across removal/rejoin, without enqueueing an ACK past busy work', async () => {
  const runtime = createGuildRuntime(); const guild = original(); const token = (await runtime.join(guild))!;
  const id = (await runtime.jobs.runWithToken(token, async () => bindGuildCustomId('raid_class_synthetic-raid')))!;
  const entered = gate(); const release = gate(); const i = input(id); const fetch = i.guild.members.fetch;
  fetch.mockImplementation(async () => { entered.release(); await release.promise; return { permissions: { has: () => true } }; });
  const dispatch = jest.fn(); const callback = runGuildInteraction(runtime, i, dispatch); await entered.promise;
  const busy = input(id); await runGuildInteraction(runtime, busy, dispatch); expect(busy.reply).toHaveBeenCalled();
  const departing = runtime.depart(guild); const joined = runtime.join(original()); release.release(); await callback; await departing; await joined;
  expect(dispatch).not.toHaveBeenCalled();
  const fresh = runtime.jobs.capture(guild.id); const output = jest.fn(); const enteredOutput = gate(); const releaseOutput = gate();
  const bound = (await runtime.jobs.runWithToken(fresh, async () => bindGuildCustomId('raid_class_synthetic-raid')))!;
  const later = runGuildInteraction(runtime, input(bound), async () => { enteredOutput.release(); await releaseOutput.promise; await guildOutput(output); });
  await enteredOutput.promise; const leaving = runtime.jobs.depart(fresh, async () => {}); releaseOutput.release(); await later; await leaving; expect(output).not.toHaveBeenCalled();
});


it('carries real welcome-first-raid issuance into the actual guided modal and rejects another actor', async () => {
  const { getFlowJobToken, routeFlowModal } = await import('../events/raidCreateFlow');
  const runtime = createGuildRuntime(); const token = (await runtime.join(original()))!;
  const welcome = (await runtime.jobs.runWithToken(token, async () => buildWelcomeMessage({ guildId: token.guildId, language: 'en', trialGranted: false })))!;
  const id = (welcome.components[0].toJSON().components[1] as any).custom_id;
  const i = input(id); i.channel = { id: 'synthetic-channel' };
  await runGuildInteraction(runtime, i, x => routeWelcomeButton(x as any));
  expect(i.showModal).toHaveBeenCalledTimes(1); expect(i.deferReply).not.toHaveBeenCalled();
  const modal = i.showModal.mock.calls[0][0].toJSON().custom_id;
  const binding = readGuildCustomId(modal)!; expect(binding.token).toBe(token);
  expect(getFlowJobToken(binding.customId, 'actor', token.guildId)).toBe(token);
  const other = input(modal); other.user = { id: 'other-actor' }; const dispatch = jest.fn(x => routeFlowModal(x as any));
  await runGuildInteraction(runtime, other, dispatch); expect(dispatch).not.toHaveBeenCalled();
});

it('keeps maintenance unadmitted, output-free and non-nestable while sharing the guild drain', async () => {
  const runtime = createGuildRuntime(); const output = jest.fn();
  await runtime.jobs.runMaintenance(original().id, async () => {
    expect(runtime.jobs.snapshot()).toEqual([]); expect(currentGuildJobToken()).toBeUndefined();
    await expect(guildOutput(output)).rejects.toThrow('Maintenance cannot publish');
    await expect(runtime.jobs.run(original().id, async () => {})).rejects.toThrow('context');
  });
  expect(output).not.toHaveBeenCalled(); expect(runtime.jobs.snapshot()).toEqual([]);
});
