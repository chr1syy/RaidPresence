# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Guild departures are recorded. `Guild.leftAt` is NULL while the bot is in a server and holds a timestamp once it is out, so a live install can finally be told apart from a dead one — the row itself has always survived a kick, since raids, teams and preferences cascade off it and deleting them would lose a server's history on every re-install. A `guildDelete` handler stamps the field, `guildCreate` clears it again and logs the re-install with how long the server had been gone
- Startup reconciliation: guilds that are still marked live in the database but no longer in the gateway's guild cache get stamped at boot, which catches kicks that happened while the bot was down

### Changed
- The trial backfill no longer treats servers the bot was kicked from as candidates — the trial is one-time, so granting it to a dead install would spend it before anyone could use it

### Notes
- **The first boot after this ships stamps a large batch of guilds at once, and that is expected.** Measured read-only on production on 2026-08-09: 116 `Guild` rows against 48 servers actually reachable via Discord, i.e. 68 departures that were never recorded. The reconciliation marks all 68 with the deploy timestamp. `leftAt` is defined as *when the departure was detected*, not when it happened, so those 68 are years of accumulated churn landing on one date — do not read them as 68 servers leaving in a single day. Every departure recorded after this deploy is accurate to the second
- Every usage number produced before this change counted database rows and was therefore too optimistic by roughly 59%

## [0.8.1] - 2026-08-09

### Changed
- The welcome message goes to the system channel first and falls back to a DM to the server owner. It no longer reads the audit log to find who invited the bot — that needs View Audit Log, which the invite does not request, so the lookup failed on every install and the message went to the system channel regardless. The system channel is now the intended path rather than an accident, and it reaches every raid leader instead of one person

## [0.8.0] - 2026-08-07

### Added
- The `[Start setup]` welcome button now walks through three settings instead of one: timezone, language, and raid leader roles. Every step is skippable and ends in a summary read back from the guild row, so a skipped step shows what was already stored. The language step preselects the value guessed from the installer's Discord locale — that guess is wrong often enough to be worth confirming once
- The guided `/raid create` preview has a ping toggle. Picking roles and deciding whether they get notified are now the same step; the default stays off, and the preview shows the actual mentions when it is on

### Changed
- `/config view` renders raid leader roles as mentions instead of raw text. The welcome chain writes role IDs, which would otherwise show up as a row of snowflakes

### Fixed
- The setup chain falls back to a link into the server when it runs in a DM, where a role select has no guild to resolve roles against

## [0.7.0] - 2026-08-04

### Added
- Guided modal flow for `/raid create` — calling it without arguments opens a modal (title, date, time), followed by a role select and a confirmation preview rendered with Discord timestamps. The one-line form with all parameters keeps working unchanged
- Welcome buttons `[Start setup]` and `[Create first raid]`, wired to the setup wizard and the new guided flow; both work when the welcome message is delivered by DM
- `src/scripts/extendTrials.ts` — one-off data correction that moves already-running trials onto the current `TRIAL_DAYS`. Dry-run by default, idempotent, skips paying guilds

### Changed
- Guild timezones are IANA zones (`Guild.timezone`) instead of a bare hour offset, so DST is handled correctly. `/config timezone` takes a zone name with autocomplete
- Locale-based timezone guessing removed — `guild.preferredLocale` is a language setting, not a location, and mapping `en-US` to UTC-5 mis-set every English-speaking server. New guilds default to UTC and confirm their zone through the raid preview
- Welcome message cut from a five-field setup wall to one sentence and two buttons; the remaining setup detail moved into the flow it belongs to
- Premium trial extended from 14 to 30 days

### Fixed
- Raid times are parsed in the guild's zone instead of the host process timezone

### Migration
- `20260803090000_guild_timezone_iana_phase1` is additive: it adds `Guild.timezone`, backfills it offset-true onto `Etc/GMT±X` (existing behaviour is reproduced exactly — no guild changes time), and leaves the legacy `timezoneOffset` in place, still written by the app. A later phase 2 drops it once production is verified. Re-runnable; aborts loudly on offsets outside -12..14 rather than silently defaulting to UTC

## [0.6.0] - 2026-07-28

### Added
- Multi-Team support (Premium) — servers can run several raid teams side by side via `/team create|list|delete`; raids, rosters, and statistics are scoped per team
- Optional `team:<name>` option with autocomplete on `/raid create|list|clone|search` and `/stats guild|status|attendance`, defaulting to the server's default team
- Every guild gets a default team ("Main") on onboarding; existing guilds, raids, and attendance records are backfilled by migration
- `team.multi` feature key with upsell embed — free servers keep exactly one team, Premium is unlimited

### Changed
- PRO tier removed (two-tier model) — only `FREE` and `PREMIUM` remain; existing PRO guilds are migrated to PREMIUM, and all former PRO-only features are now PREMIUM
- Free-tier upsell hints unified into a shared footer hint across `/raid`, `/stats`, `/config`, and `/team`
- Welcome embed and trial callout mention Multi-Team as a Premium feature
- Weekly free-tier raid limit stays server-wide — additional teams do not grant additional raid slots

---

## [0.4.0] - 2026-05-18

### Added
- Premium gates wired into commands: `/raid archive`, `/raid unarchive`, `/raid search`, `/stats guild`, `/stats suggest` now require Premium tier
- Free tier limited to 5 raids/week via `tryConsumeWeeklyRaid()` with localized upsell on `/raid create`
- Opt-out reason modal gated behind `raid.optout_reason` Premium feature (free users still opt out, just without reason field)
- `/stats attendance` history capped at 10 raids for free tier with upsell footer; Premium gets full history
- New feature keys: `raid.optout_reason` (renamed from `raid.notes`) and `stats.analytics`
- In-memory tier cache (30s TTL) on `getTier()` for responsive button interactions; invalidated on entitlement sync
- `tryConsumeWeeklyRaid()` returns `max` and `resetAt` for accurate upsell messaging
- Bot version (`v${VERSION}`) now appears in all embed footers (config view, setup, attendance upsell, welcome message)
- Interactive E2E test harness at `scripts/e2e-test.ts` (`npm run e2e:test`) with 8 scenarios for manual premium gate testing

### Changed
- Premium gates (`gateFeature()`) run before `deferReply()` in 5 commands — prevents "thinking..." spinner from hanging when access is denied
- Weekly raid slot consumption moved after all input validation in `/raid create` — invalid input no longer wastes a free-tier slot
- `premiumWeeklyLimitReached` message now passes dynamic `max` and `resetDate` instead of hardcoded values
- Premium upsell message no longer references nonexistent `/premium` command; points users to App Directory / Server Subscriptions
- Weekly limit message now includes "Upgrade to Premium for unlimited raids"
- `/raid unarchive` rebuilds full raid embed with action buttons in the original channel (previously posted bare "Raid Restored" notification, breaking re-sign-up)
- `docker-compose.yml` exposes Postgres port 5432 to host for E2E harness

### Fixed
- Deferred reply left unresolved when premium gate blocked access (5 commands affected)
- Free-tier raid slots consumed before validation, causing premature rate limiting on invalid input
- `{resetDate}` placeholder in weekly limit message rendered as raw text instead of actual date
- `/raid archive` and `/raid unarchive` failure messages now surface the actual error (e.g., "Archive channel not configured") instead of generic "Failed to archive raid"
- Free-tier direct opt-out clears stale `optoutReason`/`notedAt` from previous Premium opt-outs
- Duplicate `guild.findUnique` queries in `/stats guild` and `/stats suggest` collapsed into one fetch
- Locale tag mapping for date formatting (en→en-US, de→de-DE) — non-English guilds previously got host-default formatting
- Expired tier cache entries are deleted on miss instead of leaking memory

---

## [0.3.2] - 2026-03-24

### Added
- Premium infrastructure — `PremiumTier` enum (`FREE`, `PREMIUM`, `PRO`), premium fields on Guild model, and database migration
- Entitlement service for managing premium tier lookups, weekly raid limit enforcement, and Discord SKU entitlement sync
- Startup entitlement sync — fetches all active entitlements from Discord API on bot startup to ensure DB stays in sync after restarts
- Premium gate middleware for feature access control based on guild tier
- Discord entitlement event handlers (`entitlementCreate`, `entitlementUpdate`, `entitlementDelete`) for automatic subscription sync
- `DISCORD_SKU_PREMIUM` and `DISCORD_SKU_PRO` environment variables for Discord Store SKU configuration

### Changed
- Command restructure — `/stats` now handles analytics (player stats, raid summaries), `/raid` now owns archive operations (`archive`, `unarchive`, `search`)
- Weekly raid limit check refactored to use atomic `$transaction` to prevent race conditions
- `skuToTier()` moved to `entitlementService.ts` as shared export (used by both handler and startup sync)
- Added `ManageEvents` permission requirement to `/stats` command

### Fixed
- Race condition in weekly raid limit enforcement where concurrent requests could bypass the limit
- Entitlements not restored after bot restart (now synced from Discord API on startup)

---

## [0.2.0] - 2026-03-16

### Added
- Role-based character preferences for multi-raid-group members — players in multiple raid groups can now maintain different class/spec preferences per Discord role, with automatic fallback to global preferences
- CI/CD pipeline with automated testing and containerized deployments on version tags

### Changed
- Database provider hardcoded to PostgreSQL — removed SQLite switching infrastructure
- Simplified `.env.example` with explicit `DATABASE_URL` configuration
- CI/CD triggers restricted to version tag pushes only

### Removed
- `switch-db.js` script and `scripts/` directory
- `DB_ENV` environment variable and all dual-database provider logic
- SQLite development workflow

---

## [0.1.0] - 2026-02-18

### Added
- Database provider switching for development (SQLite) and production (PostgreSQL) environments
- `/stats` command consolidating statistics and archive operations
  - `archive` - Archive a raid to designated archive channel
  - `unarchive` - Restore archived raid to original channel
  - `search` - Search archived raids by name, player, or date
- Version display in embed footers with automatic version fetching from package.json
- Version management commands: `npm run version:patch/minor/major`
- Comprehensive documentation suite:
  - SETUP-GUIDE.md for installation and configuration
  - PLAYER-GUIDE.md for end-user guidance
  - DATABASE-TROUBLESHOOTING.md for common issues
  - VERSION.md for versioning system documentation
- Export script for PostgreSQL to SQLite data migration
- Detailed comments in switch-db.js explaining DB_ENV behavior

### Changed
- `/raid create` now requires explicit roles parameter; no longer uses global default from `/config raid-roles`
- Archive operations moved from `/raid pin/unpin` to `/stats archive/unarchive`
- Embed footer links reorganized into clickable inline fields
- Database configuration moved to DB_ENV variable with automatic provider switching
- Development workflow now defaults to SQLite for zero-config setup

### Deprecated
- `/config raid-roles` command - roles now specified per-raid
- Guild model `raidRoles` field - marked for removal in v1.0
- `/raid pin` and `/raid unpin` - use `/stats archive/unarchive` instead

### Removed
- PostgreSQL-only development migrations

### Fixed
- Command structure and permission handling aligned with new per-raid roles system

### Security
- DATABASE_URL secrets no longer stored in schema.prisma (environment-based)
- DB_ENV validation prevents accidental database provider mismatches
