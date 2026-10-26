/** Executes actual index.ts listener registrations with a disconnected Discord client. */
jest.mock('../database/client');
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../services/topggService', () => ({ startTopggStatsPoster: jest.fn() }));
jest.mock('../services/topggWebhook', () => ({ startVoteWebhook: jest.fn() }));
import { Client, Collection, Events } from 'discord.js';
import prisma from '../database/client';

let bot: Client;
let intervals: Array<{ callback: () => Promise<void>; ms: number }> = [];
let added: Array<[string | symbol, (...args: any[]) => void]> = [];
function syntheticGuild(id: string) {
  return { id, name: id, preferredLocale: 'en-US', systemChannel: null,
    members: { me: {}, fetch: jest.fn().mockResolvedValue({ permissions: { has: () => true }, roles: { cache: new Collection() } }) },
    fetchOwner: jest.fn().mockResolvedValue({ send: jest.fn().mockResolvedValue({}) }) };
}
async function listener(event: string, value: any) { await (bot.listeners(event)[0] as any)(value); }

beforeAll(async () => {
  const old = new Map(['unhandledRejection', 'SIGINT'].map(e => [e, process.listeners(e as any)]));
  jest.spyOn(Client.prototype, 'login').mockImplementation(function(this: Client) { bot = this; return Promise.resolve('synthetic-no-login'); });
  jest.spyOn(Client.prototype, 'destroy').mockResolvedValue(undefined);
  jest.spyOn(global, 'setInterval').mockImplementation(((callback: () => Promise<void>, ms: number) => {
    intervals.push({ callback, ms }); return 1 as any;
  }) as any);
  (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ leftAt: null, premiumTier: 'PREMIUM', language: 'en', timezone: 'UTC' });
  (prisma.guild.upsert as jest.Mock).mockResolvedValue({});
  (prisma.guild.update as jest.Mock).mockResolvedValue({});
  (prisma.guild.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  (prisma.guild.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.raid.findMany as jest.Mock).mockResolvedValue([]);
  await import('../index');
  Object.defineProperty(bot, 'user', { value: { tag: 'synthetic-bot', setPresence: jest.fn() }, configurable: true });
  Object.defineProperty(bot, 'application', { value: { id: 'synthetic-app' }, configurable: true });
  jest.spyOn(bot.rest, 'get').mockResolvedValue([]);
  for (const e of ['unhandledRejection', 'SIGINT']) {
    for (const fn of process.listeners(e as any)) if (!old.get(e)!.includes(fn)) added.push([e, fn]);
  }
});
afterAll(() => { for (const [event, fn] of added) process.removeListener(event, fn); jest.restoreAllMocks(); });

it('wires actual startup, a real timer tick and every scheduler SELECT to the shared guild generation', async () => {
  const guild: any = syntheticGuild('runtime-listener-guild'); bot.guilds.cache.set(guild.id, guild);
  await listener(Events.ClientReady, bot);
  const tick = intervals.find(x => x.ms === 120000)!; expect(tick).toBeDefined();
  (prisma.raid.findMany as jest.Mock).mockClear(); await tick.callback();
  expect(prisma.raid.findMany).toHaveBeenCalledTimes(4);
  for (const [input] of (prisma.raid.findMany as jest.Mock).mock.calls) expect(input.where.guildId).toBe(guild.id);
  const reaper = intervals.find(x => x.ms === 3600000 && x.callback.name === 'runReaperPass')!; expect(reaper).toBeDefined();
  (prisma.guild.findMany as jest.Mock).mockClear(); await reaper.callback();
  expect(prisma.guild.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ premiumTier: { not: 'FREE' } }) }));
});

it('runs the real config dispatcher, retains on GuildDelete, rejects a stale queued command and reopens retained history on GuildCreate', async () => {
  const guild: any = bot.guilds.cache.get('runtime-listener-guild')!;
  const input: any = { guildId: guild.id, guild, user: { id: 'synthetic-user' }, locale: 'en-US', commandName: 'config',
    isChatInputCommand: () => true, isAutocomplete: () => false,
    options: { getSubcommand: () => 'language', get: () => ({ value: 'de' }) },
    replied: false, deferred: false,
    deferReply: jest.fn(async () => { input.deferred = true; }), editReply: jest.fn(), reply: jest.fn(),
  };
  (prisma.guild.update as jest.Mock).mockClear();
  await listener(Events.InteractionCreate, input);
  expect(prisma.guild.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: guild.id }, data: { language: 'de' } }));
  (prisma.guild.updateMany as jest.Mock).mockClear(); await listener(Events.GuildDelete, guild);
  expect(prisma.guild.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: guild.id, leftAt: null }, data: { leftAt: expect.any(Date) } }));
  (prisma.guild.update as jest.Mock).mockClear(); input.deferred = false;
  await listener(Events.InteractionCreate, input); expect(prisma.guild.update).not.toHaveBeenCalled();
  expect(input.reply).toHaveBeenCalled();
  const rejoin = syntheticGuild(guild.id); await listener(Events.GuildCreate, rejoin);
  expect(prisma.guild.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { name: guild.id, leftAt: null } }));
  const marks = (prisma.guild.updateMany as jest.Mock).mock.calls.length;
  await listener(Events.GuildDelete, guild); expect(prisma.guild.updateMany).toHaveBeenCalledTimes(marks);
  expect(prisma.$transaction).not.toHaveBeenCalled(); // No delete coordinator, no purge transaction.
});

it('keeps GuildUnavailable read-only and never treats an empty startup cache as deletion', async () => {
  (prisma.guild.updateMany as jest.Mock).mockClear();
  await listener(Events.GuildUnavailable, syntheticGuild('outage-only'));
  expect(prisma.guild.updateMany).not.toHaveBeenCalled();
  bot.guilds.cache.clear(); await listener(Events.ClientReady, bot);
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(prisma.raid.deleteMany).not.toHaveBeenCalled();
});
