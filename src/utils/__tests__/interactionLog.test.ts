import {
  sanitizeValue,
  sanitizeCustomId,
  errorClassName,
  formatInteractionLog,
  logInteraction,
  commandLabel,
} from '../interactionLog';

describe('sanitizeValue', () => {
  it('passes through plain command names untouched', () => {
    expect(sanitizeValue('raid')).toBe('raid');
    expect(sanitizeValue('raid-create')).toBe('raid-create');
    expect(sanitizeValue('config:timezone')).toBe('config:timezone');
  });

  it('keeps guild-id digits intact', () => {
    expect(sanitizeValue('123456789012345678')).toBe('123456789012345678');
  });

  it('collapses whitespace so a value can never break the single-line format', () => {
    expect(sanitizeValue('two words')).toBe('two-words');
    expect(sanitizeValue('line\nbreak')).toBe('line-break');
    expect(sanitizeValue('tab\there')).toBe('tab-here');
  });

  it('strips `=` so key=value parsing stays unambiguous', () => {
    expect(sanitizeValue('a=b')).not.toContain('=');
  });

  it('renders nullish and empty input as a placeholder', () => {
    expect(sanitizeValue(null)).toBe('-');
    expect(sanitizeValue(undefined)).toBe('-');
    expect(sanitizeValue('')).toBe('-');
  });

  it('caps very long values', () => {
    const out = sanitizeValue('x'.repeat(500));
    expect(out.length).toBe(65);
    expect(out.endsWith('~')).toBe(true);
  });
});

describe('sanitizeCustomId', () => {
  // The guided raid-create flow (#38) carries a per-flow draft id after a colon.
  // It must collapse to a constant, otherwise every step logs a unique name and
  // "how many people abandon at the role picker?" becomes uncountable.
  describe('guided raid-create flow', () => {
    it('masks the per-flow draft id so steps aggregate', () => {
      expect(sanitizeCustomId('rcflow-details:dm3x9a1')).toBe('rcflow-details:<id>');
      expect(sanitizeCustomId('rcflow-roles:dm3x9a1')).toBe('rcflow-roles:<id>');
      expect(sanitizeCustomId('rcflow-confirm:dm3x9a1')).toBe('rcflow-confirm:<id>');
      expect(sanitizeCustomId('rcflow-fixtime:dm3x9a1')).toBe('rcflow-fixtime:<id>');
    });

    it('collapses two different drafts of the same step to one log name', () => {
      expect(sanitizeCustomId('rcflow-confirm:dabc123')).toBe(
        sanitizeCustomId('rcflow-confirm:dxyz789')
      );
    });

    it('still distinguishes the steps from each other', () => {
      expect(sanitizeCustomId('rcflow-roles:d1')).not.toBe(sanitizeCustomId('rcflow-confirm:d1'));
    });
  });

  it('keeps non-personal customIds fully greppable', () => {
    expect(sanitizeCustomId('raid_optout_raid-123')).toBe('raid_optout_raid-123');
    expect(sanitizeCustomId('raid_optin_raid-123')).toBe('raid_optin_raid-123');
    expect(sanitizeCustomId('spec_select_raid-123_Warrior')).toBe('spec_select_raid-123_Warrior');
  });

  it('masks the Discord user id embedded in the opt-out reason modal', () => {
    // Real shape: optout_reason_${raidId}_${userId}
    const masked = sanitizeCustomId('optout_reason_raid-123_987654321098765432');
    expect(masked).toBe('optout_reason_raid-123_<id>');
    expect(masked).not.toContain('987654321098765432');
  });

  it('masks every snowflake-shaped segment, not just the last', () => {
    expect(sanitizeCustomId('x_123456789012345678_y_98765432109876543210')).toBe('x_<id>_y_<id>');
  });

  it('leaves short numeric segments alone (they are not user ids)', () => {
    expect(sanitizeCustomId('page_2')).toBe('page_2');
    expect(sanitizeCustomId('raid_1234567890')).toBe('raid_1234567890');
  });

  it('handles nullish and empty input', () => {
    expect(sanitizeCustomId(null)).toBe('-');
    expect(sanitizeCustomId(undefined)).toBe('-');
    expect(sanitizeCustomId('')).toBe('-');
  });
});

describe('errorClassName', () => {
  class PrismaClientKnownRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
    }
  }

  it('reports the error class, never the message', () => {
    const err = new PrismaClientKnownRequestError('user bob@example.com not found');
    const out = errorClassName(err);
    expect(out).toBe('PrismaClientKnownRequestError');
    expect(out).not.toContain('bob@example.com');
  });

  it('handles plain Error', () => {
    expect(errorClassName(new Error('boom'))).toBe('Error');
  });

  it('accepts a literal class name for synthetic failures', () => {
    expect(errorClassName('CommandNotFound')).toBe('CommandNotFound');
  });

  it('handles non-Error throwables without throwing', () => {
    expect(errorClassName(null)).toBe('UnknownError');
    expect(errorClassName(undefined)).toBe('UnknownError');
    expect(errorClassName(42)).toBe('Number');
    expect(errorClassName({ a: 1 })).toBe('Object');
    expect(errorClassName(Object.create(null))).toBe('object');
  });
});

describe('formatInteractionLog', () => {
  it('formats a successful command', () => {
    expect(
      formatInteractionLog({ kind: 'CMD', guildId: '123', name: 'raid:create', ok: true, ms: 142 })
    ).toBe('CMD guild=123 cmd=raid:create ok=true ms=142');
  });

  it('formats a successful button', () => {
    expect(
      formatInteractionLog({ kind: 'BTN', guildId: '123', name: 'raid_optout_raid-1', ok: true, ms: 88 })
    ).toBe('BTN guild=123 id=raid_optout_raid-1 ok=true ms=88');
  });

  it('appends the error class on failure only', () => {
    const failed = formatInteractionLog({
      kind: 'CMD',
      guildId: '123',
      name: 'team',
      ok: false,
      ms: 310,
      err: new Error('nope'),
    });
    expect(failed).toBe('CMD guild=123 cmd=team ok=false ms=310 err=Error');

    const okLine = formatInteractionLog({ kind: 'CMD', guildId: '1', name: 'team', ok: true, ms: 1, err: new Error('x') });
    expect(okLine).not.toContain('err=');
  });

  it('marks DM-context interactions instead of emitting an empty guild', () => {
    expect(formatInteractionLog({ kind: 'CMD', guildId: null, name: 'stats', ok: true, ms: 5 })).toBe(
      'CMD guild=dm cmd=stats ok=true ms=5'
    );
  });

  it('always emits exactly one line', () => {
    const line = formatInteractionLog({
      kind: 'MODAL',
      guildId: '1\n2',
      name: 'weird\nid',
      ok: false,
      ms: 3,
      err: new Error('multi\nline'),
    });
    expect(line.split('\n')).toHaveLength(1);
  });

  it('normalises non-finite and negative durations', () => {
    expect(formatInteractionLog({ kind: 'CMD', guildId: '1', name: 'raid', ok: true, ms: NaN })).toContain('ms=0');
    expect(formatInteractionLog({ kind: 'CMD', guildId: '1', name: 'raid', ok: true, ms: -5 })).toContain('ms=0');
    expect(formatInteractionLog({ kind: 'CMD', guildId: '1', name: 'raid', ok: true, ms: 12.7 })).toContain('ms=13');
  });

  it('never leaks a user id through the customId', () => {
    const line = formatInteractionLog({
      kind: 'MODAL',
      guildId: '123456789012345678',
      name: 'optout_reason_raid-9_987654321098765432',
      ok: true,
      ms: 10,
    });
    expect(line).toContain('guild=123456789012345678');
    expect(line).not.toContain('987654321098765432');
  });
});

describe('logInteraction', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes successes to stdout', () => {
    logInteraction({ kind: 'CMD', guildId: '123', name: 'raid', ok: true, ms: 7 });
    expect(logSpy).toHaveBeenCalledWith('CMD guild=123 cmd=raid ok=true ms=7');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('writes failures to stderr', () => {
    logInteraction({ kind: 'BTN', guildId: '123', name: 'raid_optin_r1', ok: false, ms: 7, err: new Error('x') });
    expect(errorSpy).toHaveBeenCalledWith('BTN guild=123 id=raid_optin_r1 ok=false ms=7 err=Error');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('never throws, even on hostile input', () => {
    const hostile = {
      kind: 'CMD',
      guildId: {
        toString() {
          throw new Error('boom');
        },
      },
      name: 'raid',
      ok: true,
      ms: 1,
    } as never;

    expect(() => logInteraction(hostile)).not.toThrow();
  });

  it('never throws when console.log itself explodes', () => {
    logSpy.mockImplementation(() => {
      throw new Error('stdout gone');
    });
    expect(() => logInteraction({ kind: 'CMD', guildId: '1', name: 'raid', ok: true, ms: 1 })).not.toThrow();
  });
});

describe('commandLabel', () => {
  it('returns the bare name when there is no subcommand', () => {
    expect(commandLabel({ commandName: 'stats', options: { getSubcommand: () => null, getSubcommandGroup: () => null } })).toBe(
      'stats'
    );
  });

  it('appends subcommand group and subcommand', () => {
    expect(
      commandLabel({
        commandName: 'config',
        options: { getSubcommandGroup: () => 'roles', getSubcommand: () => 'add' },
      })
    ).toBe('config:roles:add');
  });

  it('appends only the subcommand when there is no group', () => {
    expect(
      commandLabel({
        commandName: 'raid',
        options: { getSubcommandGroup: () => null, getSubcommand: () => 'create' },
      })
    ).toBe('raid:create');
  });

  it('falls back to the command name when discord.js throws', () => {
    expect(
      commandLabel({
        commandName: 'team',
        options: {
          getSubcommandGroup: () => {
            throw new Error('not a subcommand command');
          },
        },
      })
    ).toBe('team');
  });

  it('tolerates a missing options accessor', () => {
    expect(commandLabel({ commandName: 'raid' })).toBe('raid');
  });
});
