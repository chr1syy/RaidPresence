# Roadmap

Future development plans for RaidPresence.

## Phase 1: Premium & Monetization Infrastructure

**Status:** Complete ✅ (shipped in v0.3.2–v0.4.0, hardened through v0.8.x)

Tiered entitlement system (FREE / PREMIUM) with feature gating, weekly
limits, and Discord/Stripe-agnostic subscription sync.

- [x] **1.2 — Prisma schema** — `premiumTier`, `premiumExpiresAt`, `entitlementId`, `weeklyRaidCount`, `weeklyRaidCountResetAt`, `trialStartedAt` on `Guild`
- [x] **1.3 — Entitlement service** (`src/services/entitlementService.ts`) — `getTier()`, `syncEntitlement()`, `hasFeature()`, `tryConsumeWeeklyRaid()`, 30s tier cache
- [x] **1.4 — Gate middleware** (`src/middleware/premiumGate.ts`) — `gateFeature()` blocks under-tier commands with an ephemeral upsell
- [x] **1.5 — Reusable upsell embed + free-tier hint**
  - `premiumUpsellEmbed(feature, currentTier, requiredTier, language)` — polished, localized rich embed showing the feature, current plan, and required plan
  - `premiumFooterHint(language)` — subtle `-#` subtext nudge, wired into gated command responses consistently
- [x] **1.6 — Premium trial** (14 days at launch, 30 since 2026-08-03) — auto-granted on `guildCreate` (`grantTrialIfEligible()`); idempotent across re-installs, never clobbers an active subscription; surfaced in the welcome embed
- [x] **1.7 — Trial backfill and extension** — `src/scripts/backfillTrials.ts` (runs at startup, idempotent by construction) grants the trial to guilds that installed before it existed; `src/scripts/extendTrials.ts` moved already-running trials onto the current `TRIAL_DAYS`
- [x] **1.8 — Two-tier model** — PRO removed in v0.6.0; only `FREE` and `PREMIUM` remain
- [x] **1.9 — Background paths honour entitlements** — the scheduler's auto-archive checks `raid.archive` like the manual command does (v0.8.4), so a lapsed trial stops archiving instead of keeping a Premium feature forever

## Phase 2: Enhanced Raid Management

**Status:** Partially Complete

- [x] **Weekly Recurring Raids** (v0.8.3, FREE)
  - `/raid create recurring:true` or the 🔁 toggle marks a raid as a series; closing one generates the next
  - Next date computed in the guild's IANA zone, so a 20:00 raid stays 20:00 across a DST switch
  - Each instance gets a fresh roster resolved against current role membership
  - Zombie guard: a series with 3 consecutive no-interaction instances pauses itself with a [Resume] button
  - `/raid recurring start|stop`
  - Deliberately FREE — see `FEATURE_TIERS` in `entitlementService.ts` for why retention itself is not monetised

- [x] **Post-Raid Nudge** (v0.8.3)
  - Closing a non-series raid posts "Same time next week?" with a one-press create button
  - Exactly once per raid, creator/leader only, button removed on use or after 48h

- [x] **Guided Raid Creation** (v0.7.0)
  - `/raid create` with no arguments opens a modal, then a role select, then a confirmation preview
  - Ping toggle in the preview (v0.8.0); the one-line form with all parameters is unchanged

- [ ] **Manual Roster Management**
  - `/raid add` - Manually add specific members to a raid
  - `/raid remove` - Remove specific members from roster
  - Override automatic role-based roster

- [ ] **Raid Status Workflow**
  - Planning: Initial creation phase
  - Open: Accepting attendance changes
  - Locked: Roster finalized, no changes allowed
  - Completed: Raid finished, archived

- [ ] **Automated Reminders**
  - Schedule automatic reminders (24h, 1h before raid)
  - Configurable reminder times per server
  - Smart mentions (only those who haven't responded)
  - Note: `/raid remind` (manual, with custom message) already ships; this item is the *scheduled* variant

- [ ] **Export Roster**
  - Export to text format
  - Copy-paste friendly output
  - Support for different game UIs (WoW addons, etc.)

## Phase 3: Scaling & Multi-Server

**Status:** Partially Complete

- [x] **Multi-Server Support**
  - Per-guild configuration in database
  - Independent settings per Discord server
  - No cross-contamination between servers

- [x] **PostgreSQL Migration**
  - Full production database support
  - SQLite removed; PostgreSQL-only
  - Performance optimizations (indexed stats/status queries)

- [x] **Multi-Team Support** (v0.6.0, PREMIUM via `team.multi`)
  - `/team create|list|delete`; raids, rosters and statistics scoped per team
  - Every guild gets a default "Main" team; existing data backfilled by migration
  - FREE stays at exactly one team; additional teams do not grant additional raid slots

- [x] **Install-base measurement** (v0.8.2)
  - `Guild.leftAt` distinguishes a live install from a departed one — rows are never deleted, so a re-install finds its history intact
  - Startup reconciliation catches kicks that happened while the bot was down
  - Discord outages (`guildUnavailable`) are logged and deliberately never treated as departures
  - Every usage number produced before this was too optimistic by roughly 59%

- [x] **Operational telemetry**
  - Structured one-line interaction logging for every command, button, modal and select
  - Verified nightly PostgreSQL backup with an off-host mirror (`ops/pg-backup.sh`, `ops/pull-backup.sh`)
  - CI on every pull request — lint, typecheck and the full Jest suite

- [ ] **Discord Sharding**
  - Support for large-scale deployment (2500+ servers)
  - Automatic shard management
  - Cross-shard communication

- [ ] **Web Dashboard**
  - View and manage raids from browser
  - Real-time updates via WebSocket
  - Mobile-responsive design
  - OAuth2 Discord login

- [ ] **Calendar Integration**
  - Discord event creation
  - Google Calendar sync
  - iCal export for external calendars

- [ ] **Guild Analytics** (partially shipped)
  - Attendance analytics, reliability scoring and composition analysis already ship via `/stats` and `/raid stats`
  - Attendance heat maps
  - Player activity trends
  - Role distribution charts
  - Peak activity times

## Phase 4: Monetization & Premium Features

**Status:** In Progress (infrastructure complete — see Phase 1)

> **Reality check (measured 2026-09-01).** 56 live guilds, of which 43 (77%) have never
> created a single raid, and 3 have run one in the last 60 days. One paying entitlement.
> The bottleneck is activation and discovery, not the feature list below — weigh new
> Premium features against that before picking one up.

- [x] **Top.gg listing integration**
  - Server count posted to the listing (without it the listing reads 0 servers, which costs placement)
  - Vote webhook persisting votes to `TopggVote` so they can be rewarded and measured
  - Both env-gated: absent credentials mean the features stay completely inert
  - See `docs/guides/TOPGG-INTEGRATION.md`

- [ ] **Premium Features**
  - Web dashboard access
  - Advanced statistics and reports
  - Custom raid templates
  - Priority support

- [ ] **Multi-Game Support**
  - Support for other MMOs (FFXIV, ESO, etc.)
  - Generic raid/event system
  - Game-specific customization

- [ ] **Custom Raid Templates** (`raid.template`, PREMIUM)
  - Save raid configurations as templates
  - Quick-create from templates
  - Share templates with other servers

- [ ] **Roster Optimization**
  - Automated role balance suggestions
  - Recommend roster changes for optimal composition
  - Class/spec distribution analysis

- [ ] **API Access**
  - Public API for integrations
  - Webhook notifications
  - Third-party bot integration

## Completed Features

### Phase 1 Quick Wins ✅

- [x] **Raid Clone** (`/raid clone`) - Clone existing raids with new date/time, preserving roles and rescanning members
- [x] **Attendance Stats** (`/raid stats`) - Per-raid and guild-wide attendance analytics with reliability scoring
- [x] **Custom Reminders** (`/raid remind message:`) - Custom leader messages and opted-out player visibility in reminders
- [x] **Status Dashboard** (`/raid status`) - At-a-glance view of up to 7 upcoming raids with roster status indicators
- [x] Database index optimization for stats and status queries

### Core Functionality ✅

- [x] Reverse sign-up system (auto-add eligible members)
- [x] Role-based attendance tracking
- [x] Class/spec selection and persistence
- [x] Interactive Discord UI (buttons, select menus)
- [x] Raid CRUD operations (create, list, edit, delete)
- [x] Per-server configuration
- [x] Permission system (raid leaders, admins)
- [x] Multi-language support (English, German)
- [x] Timezone configuration
- [x] Real-time embed updates
- [x] Late arrival tracking
- [x] Opt-out system
- [x] Role-based sorting (Tank/Healer/DPS)
- [x] Raid refresh command
- [x] Raid reminder system
- [x] Raid cancellation
- [x] Raid closing (lock roster)

## Contributing Ideas

Have an idea for a new feature? Check out [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on proposing and implementing features.

## Release Timeline

Timeline is tentative and subject to change based on priorities and community feedback.

- **Phase 1 (Premium infrastructure)**: Complete ✅
- **Phase 2 (Enhanced raid management)**: Partially complete — recurring raids, nudge and guided creation shipped in v0.7.0–v0.8.3
- **Phase 3 (Scaling & multi-server)**: Partially complete — multi-team and install-base measurement shipped; sharding and the web dashboard are untouched
- **Phase 4**: 2027 and beyond

## Priorities

Current development priorities (highest to lowest):

1. Bug fixes and stability improvements
2. **Activation** — 77% of live servers have never created a raid. Nothing else on this list matters as much as closing that gap
3. **Discovery** — the Top.gg listing, and anything else that puts the bot in front of new servers
4. User-requested features
5. Phase 2 features (enhanced management)
6. Phase 3 features (scaling)
7. Phase 4 features (premium/monetization)

---

*Last updated: 2026-09-01*
