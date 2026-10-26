# Guild data deletion — inactive review draft (updated 2026-10-26)

This draft prepares real database deletion after a confirmed final bot removal. It is
**not connected to `src/index.ts`**, has no environment switch and is not a purge
command. The running lifecycle still calls `markGuildDeparted`, preserving data.
Do not publish a claim that removal already deletes data on the strength of this PR.
No rollout, legacy deletion or retention schedule is authorized by this document.

## Implemented boundary

`src/services/guildRemoval.ts` exports a single-process coordinator:

```text
join(guild)       -> preserve legacy holds; otherwise syncGuildOnJoin and issue a token
runWithToken     -> serialize complete guild work; reject obsolete issuance tokens
run(id, job)      -> fresh job admission, or reentrant same-guild work in the running root
remove(guild,tok) -> revoke token, invalidate UI, drain, invalidate again, transact
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

The October 26 continuation adds `guildWriterAdapter.ts`, still **unregistered**.
It uses this one coordinator for entire awaited handler callbacks. Opaque callback
bindings retain the original issuance token, guild and optional actor; unbound IDs,
foreign actors/guilds and old generations are rejected before dispatch. DM handlers
receive their original customId only after an execution-time authorization predicate
succeeds for the bound guild. The adapter does not itself implement membership or
permission lookup: the eventual runtime caller must supply and await that check.

Same-guild nested helpers reuse the active asynchronous root instead of queuing
behind it. Cross-guild/lifecycle nesting and continuations outliving that root are
rejected. Busy UI callbacks are rejected immediately rather than waiting behind a
long job; the eventual dispatcher must promptly reply (or respond `[]` for
autocomplete). This preserves handlers' initial modal/reply semantics; it is not
a claim that real Discord deadlines or every existing dispatcher are integrated.

All five config write paths now use `Guild.update`, never an upsert. A deleted
Guild produces P2025 instead of resurrection, even outside the adapter. This also
means config is no longer a fallback creator if lifecycle initialization failed.
An unwrapped old write could still change a newly rejoined Guild with the same ID;
complete writer integration remains required before activation.

The actual welcome timezone/language/leader-role handlers now acknowledge their
select before network work and force-fetch current membership for the guild in
the customId. They require Administrator permission, matching the documented
`/config` and `/setup` contract, including in DMs; foreign guild context, revoked
permission and failed lookup cannot authorize a write. Deferred selects edit the
existing response rather than acknowledging twice. This authorization does not
replace issuance-generation checking for a callback that predates a rejoin.

`grantTrialIfEligible` now includes `leftAt: null` in its atomic write predicate,
enforcing the active-guild filter already present in the backfill candidate scan.
This closes a departure-between-scan-and-grant race without changing the once-per-
Guild trial contract or retaining a new anti-abuse record. Startup still syncs
entitlements before guarded trial backfill; no new provider/billing mapping is added.

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
| In-memory guided raid drafts | Invalidated per guild by inactive adapter | `invalidateGuildDrafts` runs at revocation and after drain; all seven draft readers also require matching actor and guild. Runtime registration remains outstanding |
| In-memory callback bindings / coordinator state | Bindings invalidated per guild; successful idle removal reclaims the Guild work entry | Opaque bindings contain the issuance token, original customId and optional actor ID. Failed/legacy holds remain process-local; nothing is persisted as an anti-abuse record. Token object identity rejects old work even if a later numeric generation restarts |
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
npm run test:jest -- --runInBand --runTestsByPath src/__tests__/guildRemovalCoordinator.test.ts src/events/__tests__/raidCreateFlow.test.ts src/commands/__tests__/config.test.ts
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

October 26 evidence: 33 real PostgreSQL tests; 139 tests across six targeted
coordinator/lifecycle/config/setup/guided/welcome suites; 147 tests across eight
entitlement/backfill/recurrence/scheduler/team/delete/multi-team suites; typecheck passed.
No full Jest suite was rerun for this continuation. The previous full-suite and CI
success at `1da2969` is historical evidence, not proof for a later head.

## Writer coverage at the continuation boundary

These are source references, **not a claim that every runtime writer is coordinated**.
No production entry point has been connected to the new adapter in this phase.

| Entry point / writer class | Source | Implemented proof and remaining work |
| --- | --- | --- |
| Startup Guild sync/default team | `src/index.ts:49`, `src/index.ts:71` | Existing live path unchanged. Draft `initialize` and `join` are tested; moving the complete startup guild job remains open |
| GuildCreate/onboarding | `src/index.ts:286`, `src/index.ts:291` | Draft join is generation-bound and legacy-safe. Live onboarding/trial/welcome publication still bypasses it |
| Commands: config/setup/raid/team | `src/index.ts:153` | All five config writes update-only, real DB tests; setup/read and complete raid/team operations still need one dispatch boundary |
| Raid/roster creation/clone/refresh | `src/commands/raid.ts:645`, `src/commands/raid.ts:1329`, `src/commands/raid.ts:2249` | Existing scoped/FK and recurrence guards remain; complete roster/network/database operation not yet wrapped |
| Team creation/deletion/default team | `src/services/teamService.ts:89`, `src/services/teamService.ts:191`, `src/services/teamService.ts:238` | Existing transactional team behavior qualified by focused tests; not connected to the coordinator |
| Buttons and opt-out modal | `src/events/buttonHandler.ts:29`, `src/events/buttonHandler.ts:490` | Complete actual handler and every component/modal issuance need the adapter; generic callback lifetime tested |
| Class/spec selects | `src/events/selectHandler.ts:11`, `src/events/selectHandler.ts:54` | Preference/attendance writes and their UI issuance remain unwrapped |
| Guided create modals/selects/buttons | `src/events/raidCreateFlow.ts:108`, `src/events/raidCreateFlow.ts:119` | Seven readers bind actor+guild; real store invalidated per guild at revocation and drain in inactive adapter. Runtime issuance/routing remains open |
| DM customId setup writes | `src/events/welcomeFlow.ts:71`, `src/events/welcomeFlow.ts:318` | Actual fresh-admin reauthorization and prompt acknowledgement implemented; real DM handler tested through adapter. Live customIds still lack issuance bindings |
| Autocomplete | `src/index.ts:190`, `src/utils/teamContext.ts` | No writer introduced; still needs immediate busy rejection/respond([]), generation admission and full lookup boundary in the dispatcher |
| Entitlement events/startup sync | `src/events/entitlementHandler.ts:5`, `src/services/entitlementService.ts:316` | Existing guild_id provider mapping and startup order inspected/tests passed. Complete per-guild event/REST job remains unwrapped |
| Trial grant/backfill | `src/services/entitlementService.ts:254`, `src/scripts/backfillTrials.ts:34` | Authoritative leftAt predicate added and real race scenario tested. Candidate selection and full per-guild backfill job still need admission/fencing |
| Premium reaper | `src/services/entitlementService.ts:388`, `src/utils/raidScheduler.ts:103` | Bulk job still unwrapped; split/group per guild before one-coordinator integration |
| Scheduler close/recurrence/nudge/expiry | `src/utils/raidScheduler.ts:118`, `src/utils/raidScheduler.ts:237`, `src/utils/raidScheduler.ts:276`, `src/utils/raidScheduler.ts:305` | Focused scheduler/recurrence tests and real deleted-source rejection pass. Optional concrete per-guild recurring pass now wraps SELECT through complete advanceSeries; live timer, close/nudge/expiry remain unwrapped |

The completed phase supplies the coordinator/adapter capability, concrete config,
authorization and trial-race fixes, and real-data-store proofs. The next phase is
explicit runtime entry-point and UI-issuance integration; it must not be declared
complete merely because `writer(token, callback)` can accept an arbitrary callback.

## Bounded recurring-scheduler preparation (October 26)

`processRecurringSeries(client, { coordinator, token })` now executes the actual
per-guild SELECT and complete awaited `advanceSeries` path within the supplied
coordinator root. The token is the original capability from a positively observed
join, supplied before selection; this function never captures or refreshes it.
The WHERE includes that token's guildId. Revoked admission returns without a query,
and admission/selection failure never falls back to the existing bulk path.

This is a concrete scheduler integration seam, **not registered by the live timer**.
`startRaidScheduler` still calls the existing unscoped signature. Neither runtime
join/departure handling nor legacy onboarding changes, and deletion stays off.
Each future caller must dispatch one such job per guild using the same coordinator;
close, nudge, expiry and premium-reaper passes remain outside this seam.

The whole awaited job includes Discord target/member resolution, preference writes,
the existing successor/quota transaction, attendance creation, and message posting
plus its final messageId write/cleanup. It is not one database transaction: earlier
preference updates and later attendance/Discord work cannot be undone by rolling
back successor creation. The real-DB failure test covers the existing transaction's
successor and weekly-quota rollback only. A committed deletion cannot be reversed
by code rollback.

Outbound recurrence/resume buttons still carry their existing raw IDs. Their original
issuance binding, callback reauthorization and prompt acknowledgement remain activation
blockers; this background seam neither authorizes a user nor claims UI fencing.
No new trial, billing or retention policy is selected.

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
   Include the entire async job, not just its first query. Same-guild nested `run`
   now reuses the active root; cross-guild and lifecycle nesting is rejected. Keep
   acknowledgments within Discord deadlines. Remove/replace the existing departure handler as part
   of that activation change; do not stamp `leftAt` before calling deletion. Pass
   the original discord.js Guild object to `remove`, preserving replay identity,
   rather than constructing a new `{ id, name }` object for each invocation. Carry
   its original token from observation; never capture the current token to make a
   delayed old operation look new. Duplicate original objects/tokens replay their
   original result or failure; no deletion retry is scheduled over rejoin.
3. **Draft/cache lifecycle.** Per-guild guided invalidation and issuance-bound
   callback rejection are implemented in the inactive adapter. Wire issuance into
   every UI publication path, route each callback through it, supply current
   authorization, and handle rejection promptly. Existing unbound messages cannot
   be silently re-stamped on receipt. The adapter has no persistent binding store;
   after restart old bindings must be rejected and UI refreshed deliberately.
4. **Deployment and failures.** The coordinator is for the currently documented
   single bot process. Multiple writers/processes need a shared incarnation/fencing
   mechanism, not independent copies of this queue. Slow network work can delay a
   drain; DB conflicts/deadlocks fail atomically and are propagated, with admission
   kept closed until a join. Design observable failure handling and re-confirmation
   before any retry across a rejoin. No timer or bulk retry/purge is added here.
5. **Legacy and offline removals.** `leftAt` is a detection timestamp, sometimes
   inferred from incomplete cache evidence. Neither historical marks nor startup
   cache differences authorize deletion. The current runtime join helper clears
   legacy marks while preserving history. The inactive draft instead holds a
   returning marked Guild without clearing the persisted mark or admitting writes,
   and retains its history on another removal. This hold is conservative, pending
   an explicit returning-legacy decision; it is not a new permanent retention rule.
   An offline-removal workflow needs
   explicit positive evidence and a separate reviewed change.

The original config-resurrection finding is now fixed with actual command-path DB
tests. Runtime writer integration remains incomplete: `index.ts`, maintenance loops,
entitlement handlers and UI component publication have not been connected to the
adapter. This PR remains an isolated draft, not a rollout-ready end-to-end deletion
feature. There is no activation flag, runtime registration, destructive script or
migration hidden in the patch.

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
