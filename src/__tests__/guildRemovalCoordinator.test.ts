jest.mock('../database/client');

import prisma from '../database/client';
import { createGuildRemovalDraft } from '../services/guildRemoval';
import { createGuildWriterAdapter } from '../services/guildWriterAdapter';

const guild = () => ({ id: 'synthetic-a', name: 'Synthetic Alpha' });
const A = 'synthetic-a';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((done) => { release = done; });
  return { promise, release };
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ leftAt: null });
  (prisma.guild.upsert as jest.Mock).mockResolvedValue({});
  (prisma.$transaction as jest.Mock).mockResolvedValue({ status: 'deleted', guilds: 1, raids: 0 });
});

describe('guild job generation and complete async lifetime', () => {
  it('runs nested same-guild helpers without waiting on their own queue', async () => {
    const work = createGuildRemovalDraft();
    await work.join(guild());
    expect(await work.run(A, () => work.run(A, async () => 'nested result'))).toBe('nested result');
  });

  it('rejects cross-guild and lifecycle nesting instead of creating a queue deadlock', async () => {
    const work = createGuildRemovalDraft();
    await work.join(guild());
    await work.run(A, async () => {
      await expect(work.run('synthetic-b', async () => 'wrong')).rejects.toThrow('Cross-guild');
      await expect(work.join(guild())).rejects.toThrow('lifecycle');
      await expect(work.remove(guild(), work.capture(A))).rejects.toThrow('lifecycle');
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a detached continuation after its awaited root has completed', async () => {
    const work = createGuildRemovalDraft();
    await work.join(guild());
    const resume = gate();
    let detached!: Promise<unknown>;
    await work.run(A, async () => {
      detached = resume.promise.then(() => work.run(A, async () => 'escaped'));
    });
    const rejection = expect(detached).rejects.toThrow('expired');
    resume.release();
    await rejection;
  });

  it('does not let an old token or a forged lookalike remove a later installation', async () => {
    const work = createGuildRemovalDraft();
    const old = await work.join(guild());
    await work.join(guild());
    expect(await work.remove(guild(), old!)).toEqual({ status: 'stale_generation' });
    expect(await work.remove(guild(), { ...work.capture(A) })).toEqual({ status: 'stale_generation' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deduplicates removals by original generation even with distinct event payload objects', async () => {
    const work = createGuildRemovalDraft();
    const token = (await work.join(guild()))!;
    const first = work.remove(guild(), token);
    const second = work.remove(guild(), token);
    expect(second).toBe(first);
    await first;
    await work.join(guild());
    expect(await work.remove(guild(), token)).toEqual({ status: 'deleted', guilds: 1, raids: 0 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('does not reopen admission when an original join event is replayed after removal', async () => {
    const work = createGuildRemovalDraft();
    const original = guild();
    const token = (await work.join(original))!;
    await work.remove(guild(), token);
    expect(await work.join(original)).toBe(token);
    expect(work.isCurrent(token)).toBe(false);
    expect(await work.run(A, async () => 'resurrection')).toBeUndefined();
    expect(prisma.guild.upsert).toHaveBeenCalledTimes(1);
  });

  it('retains returning legacy rows and never clears their departure mark', async () => {
    const work = createGuildRemovalDraft();
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ leftAt: new Date('2026-01-01Z') });
    expect(await work.join(guild())).toBeUndefined();
    expect(prisma.guild.upsert).not.toHaveBeenCalled();
    expect(await work.remove(guild(), work.capture(A))).toEqual({ status: 'legacy_retained' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    (prisma.guild.findUnique as jest.Mock).mockResolvedValue({ leftAt: null });
    expect(await work.join(guild())).toBeUndefined();
    expect(prisma.guild.upsert).not.toHaveBeenCalled();
  });

  it('keeps failed removal closed and replays the same error instead of retrying over rejoin', async () => {
    const work = createGuildRemovalDraft();
    const token = (await work.join(guild()))!;
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('synthetic transaction failure'));
    await expect(work.remove(guild(), token)).rejects.toThrow('synthetic');
    expect(await work.run(A, async () => 'unsafe')).toBeUndefined();
    await work.join(guild());
    await expect(work.remove(guild(), token)).rejects.toThrow('synthetic');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('invalidates immediately and again after the complete running job drains', async () => {
    const drafts = new Set(['old']);
    const invalidate = jest.fn(() => { drafts.clear(); });
    const work = createGuildRemovalDraft({ invalidateGuild: invalidate });
    const token = (await work.join(guild()))!;
    const entered = gate();
    const resume = gate();
    const running = work.run(A, async () => { entered.release(); await resume.promise; drafts.add('issued-during-drain'); });
    await entered.promise;
    const removed = work.remove(guild(), token);
    expect(drafts.size).toBe(0);
    expect(invalidate).toHaveBeenCalledTimes(1);
    resume.release();
    await running;
    await removed;
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(drafts.size).toBe(0);
  });

  it('closes admission on join failure and skips already queued writers', async () => {
    const work = createGuildRemovalDraft();
    (prisma.guild.upsert as jest.Mock).mockRejectedValueOnce(new Error('synthetic join failure'));
    const joining = work.join(guild());
    const writer = work.run(A, async () => 'unsafe');
    await expect(joining).rejects.toThrow('synthetic');
    expect(await writer).toBeUndefined();
  });
});

describe('inactive callback adapter', () => {
  it('uses the token bound at issuance and rejects the old callback after rejoin', async () => {
    const adapter = createGuildWriterAdapter();
    const token = (await adapter.coordinator.join(guild()))!;
    const callback = adapter.bindCallback(token, `welcome-lang:${A}`, 'owner');
    await adapter.coordinator.remove(guild(), token);
    await adapter.coordinator.join(guild());
    const handler = jest.fn();
    expect(await adapter.callback({ customId: callback, guildId: null, userId: 'owner' }, async () => true, handler)).toEqual({ status: 'rejected' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires an issued binding and matches both the original actor and guild', async () => {
    const adapter = createGuildWriterAdapter();
    const token = (await adapter.coordinator.join(guild()))!;
    const id = adapter.bindCallback(token, 'rcflow-confirm:synthetic', 'owner');
    const authorize = jest.fn().mockResolvedValue(true);
    const handler = jest.fn();
    for (const input of [
      { customId: 'welcome-lang:synthetic-a', guildId: A, userId: 'owner' },
      { customId: id, guildId: A, userId: 'other' },
      { customId: id, guildId: 'synthetic-b', userId: 'owner' },
    ]) expect(await adapter.callback(input, authorize, handler)).toEqual({ status: 'rejected' });
    expect(authorize).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('reauthorizes DM callbacks for the bound guild at execution and passes the original customId', async () => {
    const adapter = createGuildWriterAdapter();
    const token = (await adapter.coordinator.join(guild()))!;
    const id = adapter.bindCallback(token, `welcome-lang:${A}`, 'owner');
    const authorize = jest.fn().mockResolvedValue(false);
    const handler = jest.fn().mockResolvedValue('updated');
    const input = { customId: id, guildId: null, userId: 'owner' };
    expect(await adapter.callback(input, authorize, handler)).toEqual({ status: 'rejected' });
    expect(handler).not.toHaveBeenCalled();
    authorize.mockResolvedValue(true);
    expect(await adapter.callback(input, authorize, handler)).toEqual({ status: 'executed', value: 'updated' });
    expect(authorize).toHaveBeenLastCalledWith(A, 'owner');
    expect(handler).toHaveBeenLastCalledWith(`welcome-lang:${A}`, token);
    authorize.mockResolvedValue(false);
    expect(await adapter.callback(input, authorize, handler)).toEqual({ status: 'rejected' });
  });

  it('rejects busy UI immediately instead of queuing a modal behind a long job', async () => {
    const adapter = createGuildWriterAdapter();
    const token = (await adapter.coordinator.join(guild()))!;
    const id = adapter.bindCallback(token, 'rcflow-details:synthetic');
    const entered = gate();
    const resume = gate();
    const running = adapter.writer(token, async () => { entered.release(); await resume.promise; });
    await entered.promise;
    const showModal = jest.fn();
    expect(await adapter.callback({ customId: id, guildId: A, userId: 'leader' }, async () => true, showModal)).toEqual({ status: 'rejected' });
    expect(showModal).not.toHaveBeenCalled();
    resume.release();
    await running;
    expect(await adapter.callback({ customId: id, guildId: A, userId: 'leader' }, async () => true, async () => { showModal(); })).toEqual({ status: 'executed', value: undefined });
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('propagates authorization errors without executing a writer', async () => {
    const adapter = createGuildWriterAdapter();
    const token = (await adapter.coordinator.join(guild()))!;
    const id = adapter.bindCallback(token, 'synthetic-callback');
    const handler = jest.fn();
    await expect(adapter.callback({ customId: id, guildId: A, userId: 'member' }, async () => { throw new Error('synthetic auth failure'); }, handler)).rejects.toThrow('auth failure');
    expect(handler).not.toHaveBeenCalled();
  });
});
