# Guild data deletion — inactive review draft (2026-10-22)

This draft prepares real database deletion after a confirmed final bot removal. It is
**not connected to `src/index.ts`**, has no environment switch and is not a purge
command. The running lifecycle still calls `markGuildDeparted`, preserving data.
Do not publish a claim that removal already deletes data on the strength of this PR.
No rollout, legacy deletion or retention schedule is authorized by this document.

## Implemented boundary

`src/services/guildRemoval.ts` exports a single-process coordinator:

```text
join(guild)       -> serialize existing syncGuildOnJoin, open a new work generation
run(id, job)      -> serialize complete guild work; skip closed/obsolete generations
remove(guild)    -> close admission immediately, drain running work, delete in a transaction
queued rejoin    -> run only after deletion; create a fresh Guild using existing defaults
```

The coordinator is intended for actual `Events.GuildDelete` only. discord.js routes
`unavailable: true` gateway payloads to `Events.GuildUnavailable` and returns before
`GuildDelete`. A cached `available === false` can be stale and must not suppress a
real removal. The real installed discord.js routing is exercised without connecting
to Discord. Neither cache absence nor a failed REST call proves final removal.

The transaction locks the target Guild row, declines existing `leftAt` records, checks
cross-guild references, deletes that guild's raids and then deletes its Guild row.
Deleting raids first cascades attendance before Guild cascades preferences. A naive
Guild deletion **fails with P2003** on the current migrated database because attendance
references preferences with immediate `ON DELETE RESTRICT`. The test proves this,
rather than inferring successful deletion from `onDelete: Cascade` annotations.

The coordinator reuses `syncGuildOnJoin` and `invalidateTierCache`. The existing
`deleteRaidAndStopPredecessor` is specific to deleting one recurring instance while
preserving its predecessor. Guild deletion removes the whole series; calling that
helper per raid would fragment the atomic operation and retain no useful predecessor.
No new database model or migration is introduced.

## Deletion / non-deletion matrix

| Data class | Draft outcome for the confirmed target | Boundary / references |
| --- | --- | --- |
| Guild configuration | Delete Guild row | ID/name, leader/legacy role IDs, language/timezone, archive channel ID, timestamps and `leftAt` |
| Guild premium state | Delete with Guild | Local tier/expiry, entitlement ID, trial start and weekly quota/reset; external entitlement remains separate |
| Team | Cascade from Guild | All teams, names, creator Discord IDs and timestamps |
| Raid | Explicit scoped deletion | Open/closed/cancelled, archives, templates, descriptions, roles, creator ID, dates and team IDs |
| Raid message references | Delete with Raid | Channel/message/archive/nudge IDs and copied template ID; Discord messages themselves are outside PostgreSQL |
| Recurrence | Delete with Raid | All target instances, parent/child edges, recurrence controls, silent streak and nudge metadata |
| RaidAttendance | Cascade from Raid | User IDs/names, class/spec/status, notes/reasons and all response/interaction timestamps; denormalized guild/team IDs |
| UserPreference | Cascade from Guild after attendance removal | Despite the generic name this is **per guild**, unique on user + guild; same user's other-guild preferences survive |
| UserRolePreference | Cascade from Guild | User + guild + role IDs, class/spec and timestamps; other guilds survive |
| Another guild and its users/teams/raids/notes/premium | Preserve | Real database test compares all stored fields before/after, including the same user's rows |
| TopggVote | Preserve | User/bot IDs, vote history, type/weekend/timestamp and raw query; no Guild FK. Even a query mentioning the removed guild is not silently purged |
| Shared Discord user / provider account | Preserve | No global User/account table exists in this Prisma schema; no global deletion by `userId` |
| External Discord / Stripe entitlements, subscriptions, billing records | Outside this deletion | Local Guild entitlement pointer disappears; no cancellation/refund/provider deletion. No billing table in this schema; requires separate provider/account review |
| Discord posts, archive copies, owner DMs, member/user caches | Outside this database deletion | A removed bot generally cannot delete old server messages; this draft makes no Discord API call. Discord cache cleanup is distinct from database deletion |
| In-memory tier cache | Invalidate target on success/absence | Running/queued jobs must be inside the coordinator to prevent late cache refill |
| In-memory guided raid drafts | Not yet integrated | `raidCreateFlow` stores user/guild/channel/role IDs and title in its local Map (15-minute TTL); explicit removal invalidation is an activation prerequisite |
| Logs, infrastructure backups, exports, third-party records | Outside this function | Existing lifecycle/interaction logs may contain IDs/names. Locations and actual expiry require separate evidence; no invented retention period or legal-compliance guarantee |
| Existing `leftAt` legacy data | Preserve | Removal returns `legacy_retained`; no startup bulk deletion/backfill. Returning legacy guilds need the explicit policy decision below |

The tests enumerate all **seven Prisma models** and all **eight migrated FKs**. If
the model set changes, the coverage assertion requires this matrix to be revisited.
There are no separate analytics tables; statistics derive from the deleted raid and
attendance rows. `createdFromTemplateId` and attendance's `teamId` are scalar IDs,
not FKs. Inbound template IDs and cross-guild team/recurrence/attendance references
(including attendance's scalar team ID)
cause an atomic refusal rather than deleting another guild's data or changing its
recurrence pointer. Denormalized scalar IDs in unrelated records are not globally
searched-and-deleted as if they were ownership relationships.

## Verification and actual isolation

Run with existing PostgreSQL binaries as an ordinary user:

```bash
node scripts/test-guild-removal-db.cjs /path/to/postgresql/bin
npm run lint
npm run test:jest -- --runInBand
```

The runner accepts a **binary directory, never an existing database URL**. It creates
a new cluster under `.maestro/raidpresence-data-deletion-20261022/db-runs`, binds an
ephemeral loopback TCP port with Unix sockets disabled, generates a random test
database name, applies all repository migrations and runs the database suite. It
overrides `DATABASE_URL` for its children, never uses the inherited URL or production
fixtures, and stops its own server in `finally`. Prisma may report that it loaded
`.env`; its datasource is the explicit generated test URL. No bot entry point is
imported and no Discord login occurs. The suite checks server-reported data directory,
database name and loopback address **before fixture cleanup or writes**.

The ordinary Jest suite skips these opt-in database tests. A green ordinary Jest run
alone does not prove deletion: attach the separate runner's `jest.json`, `jest.log`,
`migrations.log`, `isolation.json` and `stop.log`. All data is synthetic, including the
shared user, paid entitlement ID, Top.gg query and cross-guild corruption fixtures.

Tests cover successful cascades, failing naive cascade order, a forced final-delete
failure with full transaction rollback, isolation, malformed foreign references,
duplicate events, real discord.js routing, legacy retention, empty/partial startup
caches, FK rejection of late child writes, queued/running jobs, independent-server
work and immediate rejoin. The existing recurring creation function is called against
a deleted source and returns `series_stopped` without a Discord call.

## Decisions and work required before activation

1. **Trial / entitlement policy.** Deleting Guild deletes `trialStartedAt`. Rejoin
   creates a fresh FREE row, and the existing onboarding would grant a new trial.
   Choose explicitly between (A) fresh trial eligibility after deletion, or (B) a
   separately scoped anti-abuse record with an approved data purpose/lifetime. This
   draft creates no such retained record. Decide how active paid entitlements are
   reattached before trial grant; deleting the local pointer does not cancel payment.
2. **Integrate every writer into one coordinator.** Startup sync and GuildCreate
   must use `join`; config/setup/raid/team/button/select/modal/autocomplete paths,
   DM welcome writes (guild ID comes from customId), entitlement handling, trial
   backfill/reaper and each guild's scheduler work must use the same `run` boundary.
   Include the entire async job, not just its first query. Do not call nested `run`
   inside an already queued guild job: this would wait on itself. Keep acknowledgments
   within Discord deadlines. Remove/replace the existing departure handler as part
   of that activation change; do not stamp `leftAt` before calling deletion. Pass
   the original discord.js Guild object to `remove`, preserving replay identity,
   rather than constructing a new `{ id, name }` object for each invocation.
3. **Draft/cache lifecycle.** Add explicit per-guild guided-draft invalidation and
   reject pre-removal UI callbacks after rejoin. Merely protecting new operations
   does not prove that an old stored draft belongs to the new installation.
4. **Deployment and failures.** The coordinator is for the currently documented
   single bot process. Multiple writers/processes need a shared incarnation/fencing
   mechanism, not independent copies of this queue. Slow network work can delay a
   drain; DB conflicts/deadlocks fail atomically and are propagated, with admission
   kept closed until a join. Design observable failure handling and re-confirmation
   before any retry across a rejoin. No timer or bulk retry/purge is added here.
5. **Legacy and offline removals.** `leftAt` is a detection timestamp, sometimes
   inferred from incomplete cache evidence. Neither historical marks nor startup
   cache differences authorize deletion. The current join helper clears legacy marks
   while preserving history; decide how a later live removal of such a returning
   legacy installation should be authorized. An offline-removal workflow needs
   explicit positive evidence and a separate reviewed change.

An executable characterization test demonstrates the activation hazard: the existing
unwrapped `setLanguage` upsert recreates Guild after deletion, while the same helper
through closed `run` is skipped. Therefore this PR is review-ready **as an isolated
draft**, not a rollout-ready end-to-end deletion feature. There is no activation flag,
runtime import, destructive script or migration hidden in the patch.

## Legacy cleanup preview and recovery limits

Do not run cleanup from this PR. Prepare a separate read-only preview from approved
evidence, partitioning confirmed removals from uncertain/returning installations and
showing affected counts per table, cross-guild anomalies, entitlement/trial effects
and excluded data classes. Freeze the exact candidate scope and its fingerprint for
explicit approval; execute only the subsequently approved scope after revalidation.
Do not turn `WHERE leftAt IS NOT NULL` into a deletion rule.

A database transaction can undo an operation that fails **before commit**. After
commit, reverting code does not restore deleted data. Backup recovery is a distinct
operational process that can reintroduce deleted data and unrelated old state; its
access, expiry and handling of prior deletions require review. Indefinite per-removal
data backups are not a privacy solution. No new backup or retention contract is
introduced here.

## Proposed privacy language

**Until activation (current behaviour):**

> Wenn der Bot einen Server verlässt, bleiben die gespeicherten Servereinstellungen,
> Teams, Raids und zugehörigen Teilnahme- und Präferenzdaten derzeit in unserer
> Datenbank erhalten. Eine automatische Löschung allein durch die Entfernung des
> Bots ist derzeit nicht umgesetzt.

**Only after approved integration and rollout, with the legacy boundary stated:**

> Für die freigegebene neue Löschfunktion gilt: Wenn Discord uns die endgültige
> Entfernung des Bots aus einem Server bestätigt, löschen wir dessen Einstellungen,
> Teams, Raids einschließlich Vorlagen und Archive sowie zugehörige Teilnahme-,
> Notiz- und Präferenzdaten aus der aktiven Bot-Datenbank. Daten anderer Server
> bleiben erhalten. Nach der Löschung beginnt die Serverkonfiguration bei erneuter
> Installation neu. Vorübergehende Nichterreichbarkeit löst keine Löschung aus.
> Serverunabhängige Votes, externe Abonnement- und Abrechnungsdaten, bereits versandte
> Discord-Nachrichten sowie Protokolle und Sicherungskopien sind von dieser
> Datenbankfunktion nicht erfasst. Bereits vor Einführung als verlassen markierte
> Altdaten werden dadurch nicht rückwirkend gelöscht.

Provider/account handling and actual log/backup practices need separately verified
wording; this text makes no legal-compliance guarantee and sets no new deadlines.
Landing PR12 must remain consistent with what is actually deployed. Coordination and
any landing changes belong to Mira; this bot draft does not change another project.
