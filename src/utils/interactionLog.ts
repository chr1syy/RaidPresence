/**
 * Structured, single-line logging for Discord interactions.
 *
 * Motivation: the bot used to log only errors and guild joins, so a silent log was
 * ambiguous — an unused bot and a broken-but-quiet bot looked identical, and the
 * question could only be answered with direct DB queries. One greppable line per
 * interaction makes "is anyone actually using this?" answerable from stdout.
 *
 * Shape (space-separated key=value, always one line):
 *   CMD guild=123 cmd=raid:create ok=true ms=142
 *   BTN guild=123 id=raid_optout_raid-123 ok=true ms=88
 *   CMD guild=123 cmd=team ok=false ms=310 err=PrismaClientKnownRequestError
 *
 * Privacy: no usernames, user tags, user IDs, or free-text command input ever reach
 * this log. Only the guild ID (already logged elsewhere), static command/subcommand
 * names, and a sanitized customId whose ID-shaped segments are masked.
 */

/** Interaction kinds we log. Autocomplete is deliberately absent: pure typing noise. */
export type InteractionLogKind = 'CMD' | 'BTN' | 'MODAL' | 'SELECT';

export interface InteractionLogFields {
  kind: InteractionLogKind;
  /** Guild ID, or null/undefined for DM-context interactions. */
  guildId?: string | null;
  /** Command name (CMD) or sanitized customId (BTN/MODAL/SELECT). */
  name?: string | null;
  ok: boolean;
  ms: number;
  /** Error class name; only rendered when ok=false. */
  err?: unknown;
}

/** Discord snowflakes are 17-20 digit decimals — mask them wherever they appear. */
const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Keep log values to a single parseable token. Allowlist: word characters (incl. `_`,
 * which customIds are split on) plus `:.<>/-`. Everything else — whitespace, control
 * characters, quotes, and `=` (which would break naive `key=value` splitting) — is
 * collapsed into a single `-`.
 */
const UNSAFE_VALUE = /[^\w:.<>\/-]+/g;

const MAX_VALUE_LENGTH = 64;

function clamp(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}~` : value;
}

/**
 * Make an arbitrary string safe to drop into a `key=value` log line: strip whitespace
 * and control characters, collapse to a single token, cap the length.
 */
export function sanitizeValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  const text = String(value).replace(UNSAFE_VALUE, '-');
  return text.length === 0 ? '-' : clamp(text);
}

/**
 * Sanitize a component customId for logging.
 *
 * Some customIds embed a Discord user ID (e.g. `optout_reason_<raidId>_<userId>`),
 * which is personal data and must not be logged. Every `_`-separated segment that
 * looks like a snowflake is replaced with `<id>`, so the *shape* of the interaction
 * stays greppable while the identity does not survive.
 *
 * The guided raid-create flow (`events/raidCreateFlow.ts`) uses `handler:<draftId>`
 * instead. The draft id is not personal data, but it is unique per flow, so leaving
 * it in would give every line a distinct name and make drop-off rates impossible to
 * count. Everything after the first `:` is therefore masked as well — the point of
 * the log is which *step* people abandon, not which draft.
 */
export function sanitizeCustomId(customId: unknown): string {
  if (customId === null || customId === undefined) return '-';
  const raw = String(customId).replace(UNSAFE_VALUE, '-');
  if (raw.length === 0) return '-';

  const [handler, ...payload] = raw.split(':');

  const masked = handler
    .split('_')
    .map((segment) => (SNOWFLAKE.test(segment) ? '<id>' : segment))
    .join('_');

  return clamp(payload.length > 0 ? `${masked}:<id>` : masked);
}

/** Extract a stable, non-personal error class name. Never throws. */
export function errorClassName(error: unknown): string {
  try {
    if (error === null || error === undefined) return 'UnknownError';
    // Callers may pass a literal class name for synthetic failures (e.g. CommandNotFound).
    if (typeof error === 'string') return sanitizeValue(error);
    if (error instanceof Error) {
      return sanitizeValue(error.name || error.constructor?.name || 'Error');
    }
    const ctor = (error as { constructor?: { name?: string } }).constructor?.name;
    return sanitizeValue(ctor || typeof error);
  } catch {
    return 'UnknownError';
  }
}

/** Render a single log line. Pure — no I/O, no throwing. */
export function formatInteractionLog(fields: InteractionLogFields): string {
  const kind = fields.kind;
  const nameKey = kind === 'CMD' ? 'cmd' : 'id';
  const name = kind === 'CMD' ? sanitizeValue(fields.name) : sanitizeCustomId(fields.name);
  const guild = fields.guildId ? sanitizeValue(fields.guildId) : 'dm';
  const ms = Number.isFinite(fields.ms) ? Math.max(0, Math.round(fields.ms)) : 0;

  let line = `${kind} guild=${guild} ${nameKey}=${name} ok=${fields.ok === true} ms=${ms}`;
  if (fields.ok !== true) {
    line += ` err=${errorClassName(fields.err)}`;
  }
  return line;
}

/**
 * Emit one interaction log line. Guaranteed not to throw: logging must never be able
 * to turn a working command into a failed one, so every failure path here is swallowed.
 * Failures go to console.error, successes to console.log, so an error-level log filter
 * still surfaces the bad ones.
 */
export function logInteraction(fields: InteractionLogFields): void {
  try {
    const line = formatInteractionLog(fields);
    if (fields.ok === true) {
      console.log(line);
    } else {
      console.error(line);
    }
  } catch {
    // Intentionally silent: a broken log line is never worth failing an interaction.
  }
}

/**
 * Build the `cmd=` value for a chat input command: the command name plus its
 * subcommand group/subcommand when present (e.g. `config:timezone`). All three are
 * static, developer-defined names — never user input. Never throws; falls back to the
 * bare command name if discord.js rejects the accessor.
 */
export function commandLabel(interaction: {
  commandName: string;
  options?: {
    // `required: false` matches the discord.js overload that returns `string | null`.
    getSubcommandGroup?: (required: false) => string | null;
    getSubcommand?: (required: false) => string | null;
  };
}): string {
  const parts: string[] = [interaction.commandName];
  try {
    const group = interaction.options?.getSubcommandGroup?.(false) ?? null;
    if (group) parts.push(group);
    const sub = interaction.options?.getSubcommand?.(false) ?? null;
    if (sub) parts.push(sub);
  } catch {
    // Not a subcommand-bearing command — the bare name is the right answer.
  }
  return sanitizeValue(parts.join(':'));
}
