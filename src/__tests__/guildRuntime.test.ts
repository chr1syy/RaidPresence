jest.mock('../database/client');
import prisma from '../database/client';
import { createGuildRuntime } from '../services/guildRuntime';
import { guildOutput } from '../services/guildJobs';
import { runGuildInteraction } from '../events/guildInteraction';
import configCommand from '../commands/config';

function gate() { let release!: () => void; const promise = new Promise<void>(r => { release = r; }); return { promise, release }; }
const guild = () => ({ id: 'runtime-guild', name: 'Synthetic Guild' });
beforeEach(() => {
  jest.clearAllMocks();
  (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ leftAt: null, language: 'en' });
  (prisma.guild.upsert as jest.Mock).mockResolvedValue({});
  (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.guild.update as jest.Mock).mockResolvedValue({});
});

it('retains returning legacy onboarding and has no destructive runtime capability', async () => {
  const runtime = createGuildRuntime();
  (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ leftAt: new Date('2026-01-01Z') });
  expect(await runtime.join(guild())).toBeDefined();
  expect(prisma.guild.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { name: 'Synthetic Guild', leftAt: null } }));
  expect('remove' in runtime).toBe(false);
  expect('remove' in runtime.jobs).toBe(false);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('revokes immediately, drains retained departure, skips old queued jobs and deduplicates old event replay over rejoin', async () => {
  const invalidation = jest.fn(); const runtime = createGuildRuntime(invalidation); const original = guild();
  const old = (await runtime.join(original))!; const entered = gate(); const release = gate();
  const running = runtime.jobs.runWithToken(old, async () => { entered.release(); await release.promise; });
  await entered.promise;
  const queuedWrite = jest.fn(); const queued = runtime.jobs.runWithToken(old, queuedWrite);
  const departed = runtime.depart(original); const freshJoin = runtime.join(guild());
  expect(runtime.jobs.isCurrent(old)).toBe(false);
  expect(prisma.guild.updateMany).not.toHaveBeenCalled();
  release.release(); await running; await queued; await departed; const fresh = await freshJoin;
  expect(queuedWrite).not.toHaveBeenCalled(); expect(fresh).toBeDefined();
  expect(prisma.guild.updateMany).toHaveBeenCalledTimes(1);
  await runtime.depart(original); expect(prisma.guild.updateMany).toHaveBeenCalledTimes(1);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(invalidation).toHaveBeenCalled();
});

it('suppresses output delayed across a retained departure', async () => {
  const runtime = createGuildRuntime(); const original = guild(); const token = (await runtime.join(original))!;
  const entered = gate(); const release = gate(); const send = jest.fn();
  const running = runtime.jobs.runWithToken(token, async () => { entered.release(); await release.promise; await guildOutput(send); });
  const rejected = expect(running).rejects.toThrow('revoked'); await entered.promise;
  const departure = runtime.depart(original); release.release(); await rejected; await departure;
  expect(send).not.toHaveBeenCalled();
});

it('closes admission when retained join fails instead of running queued commands', async () => {
  const runtime = createGuildRuntime(); (prisma.guild.upsert as jest.Mock).mockRejectedValueOnce(new Error('synthetic failure'));
  const joining = runtime.join(guild()); const write = jest.fn(); const queued = runtime.jobs.runWithToken(runtime.jobs.capture(guild().id), write);
  await expect(joining).rejects.toThrow('synthetic'); await queued;
  expect(write).not.toHaveBeenCalled();
});

function commandInput(admin = true) {
  const member = { permissions: { has: () => admin }, roles: { cache: { some: () => false } } };
  const input: any = {
    guildId: guild().id, guild: { id: guild().id, name: guild().name, members: { fetch: jest.fn().mockResolvedValue(member) } },
    user: { id: 'synthetic-user' }, locale: 'en-US', commandName: 'config',
    isChatInputCommand: () => true, isAutocomplete: () => false,
    member: { permissions: { has: () => true } }, memberPermissions: { has: () => true },
    options: { getSubcommand: () => 'language', getString: () => 'de', get: () => ({ value: 'de' }) },
    replied: false, deferred: false,
    deferReply: jest.fn(async () => { input.deferred = true; }),
    reply: jest.fn(async () => { input.replied = true; }), editReply: jest.fn().mockResolvedValue(undefined),
  };
  return input;
}

it('executes the actual config command with fresh current authorization and the same complete job', async () => {
  const runtime = createGuildRuntime(); await runtime.join(guild()); const input = commandInput();
  await runGuildInteraction(runtime, input, i => configCommand.execute(i as any));
  expect(input.guild.members.fetch).toHaveBeenCalledWith({ user: input.user.id, force: true });
  expect(prisma.guild.update).toHaveBeenCalledWith(expect.objectContaining({ data: { language: 'de' } }));
  expect(input.editReply).toHaveBeenCalled();
});

it('denies revoked Administrator access, delayed auth after departure, and busy autocomplete promptly', async () => {
  const runtime = createGuildRuntime(); const original = guild(); const token = (await runtime.join(original))!;
  const denied = commandInput(false); await runGuildInteraction(runtime, denied, i => configCommand.execute(i as any));
  expect(prisma.guild.update).not.toHaveBeenCalled(); expect(denied.reply).toHaveBeenCalledTimes(1);
  const entered = gate(); const release = gate(); const delayed = commandInput();
  delayed.guild.members.fetch.mockImplementation(async () => { entered.release(); await release.promise; return { permissions: { has: () => true } }; });
  const command = runGuildInteraction(runtime, delayed, i => configCommand.execute(i as any)); await entered.promise;
  const autocomplete: any = { guildId: original.id, locale: 'en', isChatInputCommand: () => false, isAutocomplete: () => true, respond: jest.fn() };
  await runGuildInteraction(runtime, autocomplete, async () => { throw new Error('busy lookup must not start'); });
  expect(autocomplete.respond).toHaveBeenCalledWith([]);
  const departure = runtime.depart(original); release.release(); await command; await departure;
  expect(prisma.guild.update).not.toHaveBeenCalled(); expect(delayed.editReply).not.toHaveBeenCalled();
  expect(runtime.jobs.isCurrent(token)).toBe(false);
});

it('keeps showModal as the first response and never restamps a legacy callback', async () => {
  const runtime = createGuildRuntime(); await runtime.join(guild()); const input = commandInput(); input.commandName = 'raid';
  input.showModal = jest.fn();
  await runGuildInteraction(runtime, input, async i => { await guildOutput(async () => (i as any).showModal({})); });
  expect(input.showModal).toHaveBeenCalledTimes(1); expect(input.deferReply).not.toHaveBeenCalled();
  const raw: any = { isChatInputCommand: () => false, isAutocomplete: () => false };
  const dispatch = jest.fn(async () => { expect(runtime.jobs.current()).toBeUndefined(); });
  await runGuildInteraction(runtime, raw, dispatch); expect(dispatch).toHaveBeenCalledWith(raw);
});

it.each([true, false])('compensates only newly sent messages, never pre-existing edits (created=%s)', async created => {
  const runtime = createGuildRuntime(); const original = guild(); const token = (await runtime.join(original))!;
  const entered = gate(); const release = gate(); const removeMessage = jest.fn().mockResolvedValue(undefined);
  const running = runtime.jobs.runWithToken(token, () => guildOutput(async () => {
    entered.release(); await release.promise; return { delete: removeMessage };
  }, created));
  const rejected = expect(running).rejects.toThrow('revoked'); await entered.promise;
  const leaving = runtime.depart(original); release.release(); await rejected; await leaving;
  expect(removeMessage).toHaveBeenCalledTimes(created ? 1 : 0);
});

it('does not revoke a fresh positive installation for an unobserved old payload', async () => {
  const runtime = createGuildRuntime(); const token = (await runtime.join(guild()))!;
  await runtime.depart(guild());
  expect(runtime.jobs.isCurrent(token)).toBe(true);
  expect(prisma.guild.updateMany).not.toHaveBeenCalled();
});
