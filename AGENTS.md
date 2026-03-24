# AGENTS.md - RaidPresence

## Project Overview

**RaidPresence** is a Discord bot for World of Warcraft raid attendance management using a **reverse sign-up** system. Instead of requiring raiders to opt-in, everyone on the roster is automatically signed up and must opt-out if they can't attend.

- **Language:** TypeScript
- **Runtime:** Node.js 18+
- **Framework:** discord.js v14
- **Database:** PostgreSQL via Prisma ORM
- **Testing:** Jest 30 with ts-jest
- **License:** Custom Business Source License (CBSL)

---

## Repository Structure

```
RaidPresence/
├── prisma/
│   ├── schema.prisma              # Database schema (4 models)
│   └── migrations/                # Prisma migration files
├── src/
│   ├── index.ts                   # Bot entry point, client setup, event registration
│   ├── deploy-commands.ts         # Slash command deployment (guild + global)
│   ├── commands/
│   │   ├── raid.ts                # /raid command (14 subcommands)
│   │   ├── config.ts              # /config command (6 subcommands)
│   │   └── setup.ts              # /setup command (initial server setup)
│   ├── database/
│   │   └── client.ts              # Prisma client singleton
│   ├── events/
│   │   ├── buttonHandler.ts       # Button interactions (attendance, notes modal)
│   │   ├── entitlementHandler.ts  # Discord entitlement event handlers (premium sync)
│   │   └── selectHandler.ts       # Select menu interactions (class/spec)
│   ├── middleware/
│   │   └── premiumGate.ts         # Feature gating by premium tier
│   ├── services/
│   │   └── entitlementService.ts  # Premium tier management, SKU mapping, startup sync
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   └── utils/
│       ├── wowData.ts             # WoW class/spec/role data
│       ├── permissions.ts         # Permission checking utilities
│       ├── localization.ts        # i18n (EN/DE) translation system
│       ├── timezoneHelper.ts      # Timezone offset handling
│       ├── raidScheduler.ts       # Cron-style raid expiry + auto-archive
│       ├── statsCalculator.ts     # Per-raid and guild-wide stats (Phase 1)
│       ├── statsFormatter.ts      # Stats embed formatting (Phase 1)
│       ├── statusFormatter.ts     # Status dashboard embed (Phase 1)
│       ├── attendanceAnalytics.ts # Player attendance trends/history (Phase 2)
│       ├── attendanceFormatter.ts # Attendance embed formatting (Phase 2)
│       ├── compositionAnalyzer.ts # Raid composition analysis (Phase 2)
│       ├── compositionFormatter.ts# Composition embed formatting (Phase 2)
│       ├── notesFormatter.ts      # Raid notes embed formatting (Phase 2)
│       ├── archiveManager.ts      # Archive operations (Phase 2)
│       └── archiveFormatter.ts    # Archive search embed formatting (Phase 2)
├── docs/
│   ├── commands/
│   │   ├── RAID-COMMAND.md        # /raid command reference
│   │   └── CONFIG-COMMAND.md      # /config command reference
│   ├── features/
│   │   ├── phase1-features.md     # Phase 1 feature documentation
│   │   └── phase2-features.md     # Phase 2 feature documentation
│   └── guides/
│       ├── SETUP-GUIDE.md         # Installation & setup
│       └── PLAYER-GUIDE.md        # Player interaction guide
├── coverage/                      # Jest coverage reports
├── package.json
├── tsconfig.json
├── jest.config.js
└── .env.example
```

---

## Database Configuration

### Provider Setup
- **Provider:** PostgreSQL (hardcoded in `prisma/schema.prisma`)
- **Connection:** Via `DATABASE_URL` environment variable
- **Local Development:** Use `docker compose up` for a local PostgreSQL instance

---

## Database Schema

Five Prisma models in `prisma/schema.prisma`:

### Guild
Per-server configuration. Fields: `id`, `name`, `raidRoles` (deprecated), `raidLeaderRoles`, `language` (en/de), `timezoneOffset`, `archiveChannelId`, `autoArchive`, `premiumTier` (FREE/PREMIUM/PRO), `premiumExpiresAt`, `entitlementId`, `weeklyRaidCount`, `weeklyRaidCountResetAt`.

**Note:** `raidRoles` is deprecated as of PR #15. Raid roles are now specified per-raid via `/raid create roles:` parameter.

### UserPreference
Player class/spec preferences per guild. Fields: `userId`, `guildId`, `username`, `wowClass`, `wowSpec`. Unique on `[userId, guildId]`.

### Raid
Individual raid instances. Fields: `id`, `guildId`, `channelId`, `messageId`, `raidDate`, `description`, `roles`, `status` (open/closed/cancelled), `createdBy`. Template/clone fields: `templateName`, `isTemplate`, `createdFromTemplateId`, `clonedAt`. Archive fields: `archivedAt`, `archiveChannelId`, `archiveMessageId`, `isPinned`. Indexed on `[guildId, status]`, `[raidDate]`, `[guildId, raidDate]`, `[guildId, archivedAt]`.

### RaidAttendance
Per-player attendance per raid. Fields: `raidId`, `userId`, `username`, `status` (attending/opted_out/late), `wowClass`, `wowSpec`, `respondedAt`. Notes fields: `optoutReason`, `playerNote`, `notedAt`. Unique on `[raidId, userId]`. Indexed on `[raidId, status]`, `[userId, guildId, status]`.

---

## Implemented Features

### Core (Baseline on main)
- Reverse sign-up system (auto-add eligible members by Discord role)
- Per-server configuration (`/config raid-roles`, `/config leader-roles`, `/config timezone`, `/config language`)
- Class/spec selection via select menus with persistence
- Role-based sorting (Tank > Healer > DPS)
- Raid CRUD: `/raid create`, `/raid list`, `/raid edit`, `/raid delete`
- Raid lifecycle: `/raid close`, `/raid cancel`, `/raid refresh`
- `/raid remind` - basic reminder
- Interactive Discord UI (buttons, select menus, embeds)
- Real-time embed updates on player action
- Multi-language support (English, German)
- Timezone configuration
- Permission system (raid leaders, admins)
- Scheduled raid expiry via `raidScheduler.ts` (runs every 2 minutes)

### Phase 1 - Quick Wins (Implemented)
- **`/raid clone`** - Clone existing raids with new date/time, preserving roles, rescanning members
- **`/raid stats`** - Per-raid and guild-wide attendance analytics with reliability scoring, class distribution, top attendees
- **`/raid remind message:`** - Enhanced reminders with custom leader messages and opted-out player visibility
- **`/raid status`** - Dashboard showing up to 7 upcoming raids with roster fill %, role breakdown, and color-coded status (FULL/GOOD/LOW)
- Database index optimizations for stats/status queries

### Phase 2 - Depth Features (Implemented)

#### 2.1 Player Attendance History & Trends
- **`/raid attendance player: period:`** - View player reliability trends, response times, and role flexibility
- `attendanceAnalytics.ts` - `calculatePlayerStats()`, `getPlayerRoleDistribution()`, `getPlayerAttendanceHistory()`, `getTrendData()`
- `attendanceFormatter.ts` - Color-coded reliability embeds (green/yellow/red)
- Periods: 30 days, 90 days, all-time
- Trend detection: improving/stable/declining with confidence scoring
- Database migration: `20260209120000_add_query_indexes`, `20260210000000_add_attendance_indexes`

#### 2.2 Class/Spec Recommendations & Composition Analysis
- **`/raid suggest raid_id:`** - Analyze raid composition, identify gaps, suggest player swaps
- `compositionAnalyzer.ts` - `analyzeRaidComposition()`, `findCompositionGaps()`, `suggestPlayerSwaps()`, `calculateSuccessLikelihood()`
- `compositionFormatter.ts` - Role-specific embeds with optimal vs current counts
- Optimal composition targets: 10-man (2T/2-3H/5-6D), 20-man (2T/4-5H/13-14D)
- Success likelihood algorithm: composition balance (40%) + healer ratio (30%) + tank coverage (20%) + flexibility (10%)

#### 2.3 Optional Raid Notes / Opt-Out Comments
- **`/raid notes raid_id:`** - View all notes for a raid
- Opt-out modal via `buttonHandler.ts` - Players can provide reason (max 100 chars)
- `notesFormatter.ts` - Separates opt-out reasons and player comments
- Database migration: `20260210100000_add_raid_notes` (adds `optoutReason`, `playerNote`, `notedAt` to RaidAttendance)

#### 2.4 Raid Archive System
- Archive functionality consolidated to `/stats` command for centralized access
- **`/stats archive raid_id:`** - Archive a raid (copy to archive channel, remove original)
- **`/stats unarchive raid_id:`** - Restore archived raid to original channel
- **`/stats search query: period:`** - Search archived raids by name/player/date
- **`/config archive-channel channel:`** - Set guild archive channel
- **`/config auto-archive enabled:`** - Toggle auto-archive on raid close
- `archiveManager.ts` - `archiveRaid()`, `unarchiveRaid()`, `searchArchive()`, `getArchiveStats()`, `setupArchiveChannel()`
- `archiveFormatter.ts` - Archive search result embeds with pagination
- Auto-archive integrated into `raidScheduler.ts` `checkAndCloseExpiredRaids()`
- Guild isolation enforced on all archive operations
- Database migration: `20260210150000_add_archive_fields`

### Premium Infrastructure (v0.3.2)
- **Premium tiers:** `FREE`, `PREMIUM`, `PRO` — stored on Guild model
- **Entitlement service** (`entitlementService.ts`): `getTier()`, `hasFeature()`, `tryConsumeWeeklyRaid()`, `syncEntitlement()`, `syncEntitlementsOnStartup()`
- **Premium gate** (`premiumGate.ts`): `gateFeature()` — checks tier access and sends ephemeral upsell if blocked
- **Entitlement handler** (`entitlementHandler.ts`): Listens to Discord `EntitlementCreate`, `EntitlementUpdate`, `EntitlementDelete` events
- **Startup sync**: Fetches all active entitlements from Discord API on bot ready to ensure DB reflects current state
- **Feature tier map**: `raid.notes`, `raid.archive`, `raid.recurring`, `stats.full_history` → PREMIUM; `raid.template`, `stats.export`, `raid.integrations` → PRO
- **Weekly raid limit**: Free tier = 5/week (atomic via `$transaction`), Premium/Pro = unlimited
- **SKU config**: `DISCORD_SKU_PREMIUM`, `DISCORD_SKU_PRO` env vars mapped via `skuToTier()`

---

## Commands Reference

### `/raid` Subcommands (14 total)

| Subcommand | Permission | Description |
|-----------|-----------|-------------|
| `create` | Leader role | Create a new raid |
| `list` | Any member | List upcoming raids |
| `edit` | Leader role | Edit raid details |
| `delete` | Leader role | Delete a raid |
| `close` | Leader role | Lock raid roster |
| `cancel` | Leader role | Cancel a raid |
| `refresh` | Leader role | Refresh roster and embed |
| `clone` | Leader role | Clone raid with new date/time |
| `stats` | Any member | View attendance statistics |
| `remind` | Leader role | Send reminder with custom message |
| `status` | Any member | Status dashboard of upcoming raids |
| `attendance` | Any member | View player attendance history |
| `suggest` | Any member | Composition analysis and recommendations |
| `notes` | Any member | View raid notes and opt-out reasons |

### `/stats` Subcommands (Archive operations consolidated here)

| Subcommand | Permission | Description |
|-----------|-----------|-------------|
| `archive` | Leader role | Archive a raid to archive channel |
| `unarchive` | Leader role | Restore archived raid to original channel |
| `search` | Any member | Search archived raids by name/player/date |

**Note:** Archive operations previously in `/raid pin/unpin` are now consolidated in `/stats` for centralized access to statistics and archival functionality.

### `/config` Subcommands (6 total)

| Subcommand | Permission | Description |
|-----------|-----------|-------------|
| `raid-roles` | Admin | Set roles scanned for raids (deprecated) |
| `leader-roles` | Admin | Set roles that can manage raids |
| `timezone` | Admin | Set server timezone offset |
| `language` | Admin | Set bot language (en/de) |
| `archive-channel` | Admin | Set archive channel |
| `auto-archive` | Admin | Toggle auto-archive |

**Note:** `/config raid-roles` is deprecated as of PR #15. Raid roles are now specified per-raid via `/raid create roles:` parameter.

### `/setup`
Initial server configuration wizard.

---

## Key Patterns

### Guild Isolation
All database queries include `guildId` to prevent cross-server data access:
```typescript
const raid = await prisma.raid.findFirst({
  where: { id: raidId, guildId: interaction.guildId }
});
```

### Localization
All user-facing strings go through `getTranslations(locale)` from `src/utils/localization.ts`. Supports `en` and `de`.

### Error Handling
Commands catch errors and reply with ephemeral messages using localized strings:
```typescript
try {
  // ... operation
} catch (error) {
  console.error(`[Command]`, error);
  await interaction.reply({ content: trans.errorOccurred, ephemeral: true });
}
```

### Permission Checking
Uses `canManageRaids(interaction)` from `src/utils/permissions.ts` which checks configured leader roles or Administrator permission.

### Command Deployment
`src/deploy-commands.ts` supports both guild-specific and global deployment. Use `npm run deploy` for development, production deploys commands on startup.

---

## Testing

### Test Structure
```
src/
├── __tests__/
│   ├── entitlementService.test.ts   # Entitlement service tests
│   └── premiumGate.test.ts          # Premium gate middleware tests
├── commands/__tests__/
│   ├── raid-create.test.ts        # Raid creation tests
│   ├── raid-clone.test.ts         # Clone command tests
│   ├── raid-close-cancel.test.ts  # Close/cancel tests
│   ├── raid-delete.test.ts        # Delete command tests
│   ├── raid-list.test.ts          # List command tests
│   ├── raid-refresh.test.ts       # Refresh command tests
│   ├── raid-remind.test.ts        # Remind command tests
│   ├── raid-stats.test.ts         # Stats command tests
│   ├── raid-status.test.ts        # Status command tests
│   ├── raid-attendance.test.ts    # Attendance command tests
│   ├── config.test.ts             # Config command tests
│   ├── setup.test.ts              # Setup command tests
│   ├── security.test.ts           # Security & data integrity tests
│   ├── ux-verification.test.ts    # UX verification tests
│   ├── integration/
│   │   ├── phase1.integration.test.ts
│   │   ├── raid-archive.integration.test.ts
│   │   ├── raid-attendance.integration.test.ts
│   │   ├── raid-notes.integration.test.ts
│   │   └── raid-suggest.integration.test.ts
│   └── performance/
│       └── phase1.performance.test.ts
├── events/__tests__/
│   └── buttonHandler-notes.test.ts
└── utils/__tests__/
    ├── archiveManager.test.ts
    ├── attendanceAnalytics.test.ts
    ├── attendanceFormatter.test.ts
    ├── compositionAnalyzer.test.ts
    ├── compositionFormatter.test.ts
    ├── raidScheduler.test.ts
    ├── statsCalculator.test.ts
    ├── statusFormatter.test.ts
    └── integration/
        └── raidScheduler-autoArchive.integration.test.ts
```

### Running Tests
```bash
npm run test:jest          # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
npm run test               # TypeScript type checking only (tsc --noEmit)
```

### Coverage
- 681+ tests total
- Overall coverage: ~78%
- Phase 2 critical modules: >85%

---

## Development Workflow

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Deploy slash commands (development)
npm run deploy

# Start in development mode (auto-restart)
npm run dev

# Build for production
npm run build

# Start production
npm start
```

### Version Management Commands

```bash
# Bump patch version (1.0.0 → 1.0.1) - Bug fixes
npm run version:patch

# Bump minor version (1.0.0 → 1.1.0) - New features
npm run version:minor

# Bump major version (1.0.0 → 2.0.0) - Breaking changes
npm run version:major
```

Version is automatically displayed in embed footers. See `docs/VERSION.md` for detailed versioning guidelines.

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `DISCORD_TOKEN` - Bot token
- `CLIENT_ID` - Application client ID
- `DATABASE_URL` - PostgreSQL connection string (required)
- `GUILD_ID` - (optional) Guild ID for guild-specific command deployment
- `DISCORD_SKU_PREMIUM` - Discord Store SKU ID for Premium tier
- `DISCORD_SKU_PRO` - Discord Store SKU ID for Pro tier

---

## Key Learnings and Workflow Notes

- **PR Splitting Approach:** For large PRs with multiple features, create separate branches from a base branch (e.g., raidpresence-updates), cherry-pick relevant commits, resolve conflicts, and compile before creating focused PRs. This was used for Phase 3 features: badge schema/system, feedback schema/system, admin tools.
- **Feature Implementation:** Implement incrementally (schema → functionality), fix corrupted functions, add translations, and ensure guild isolation.
- **Testing and Verification:** Run lint/typecheck after changes; focus on integration tests for new features.

---

## Auto Run Documentation Framework (PR #15 Review Fixes)

### Lessons from Second Review Cycle

**Issue:** Initial Copilot review (13 issues) was fixed successfully, but second review revealed 13 NEW implementation gaps despite first-round fixes. This highlighted the need for a structured, repeatable Auto Run documentation format.

### Auto Run Document Structure

Auto Run documents should follow this structure for agent execution:

1. **One Markdown File = One Auto Run Session**
   - Files: `PR15-05-CRITICAL-FIXES.md`, `PR15-06-HIGH-PRIORITY-FIXES.md`, `PR15-07-MEDIUM-POLISH.md`
   - Each file contains multiple related fixes

2. **Each Fix is a Markdown Task**
   - Every fix section starts with `- [ ]` checkbox before the heading
   - Checkbox allows agents to track completion per fix
   - Format: `- [ ] ## Fix N: Description`

3. **Flowing Narrative, No Subtasks**
   - Each fix section is a complete, self-contained task prompt
   - Plain prose instructions (no numbered subtasks like 1.1, 1.2, 1.3)
   - No checkbox lists for agents to follow
   - Structured with: Issue → Current State → What to fix → After fix, verify

4. **Verification at Each Step**
   - Explicit verification commands after each fix
   - Expected results clearly stated
   - Tests to run, build to check

### Document Organization by Severity

- **CRITICAL:** Blocking deployment, runtime failures (1-1.5 hrs, 5 fixes)
- **HIGH:** Functionality broken, must fix before merge (1.5-2 hrs, 6 fixes)
- **MEDIUM:** UX/maintainability issues, before release (30-45 min, 3 fixes)

### Execution Flow

1. Agent reads entire markdown file
2. Works through each `- [ ]` fix sequentially
3. Auto Run checks off checkbox on completion
4. Moves to next file (next session) after all fixes complete
5. No dependencies between files (each is independent)

### Key Success Factors

- **Clear problem statements:** What's broken and why
- **Current state documentation:** How to identify the issue
- **Actionable instructions:** What code changes to make
- **Explicit verification:** How to prove the fix works
- **Git commits:** Clear commit messages per fix for tracking
- **No ambiguity:** Agents should never guess what to do

### Anti-Patterns to Avoid

- ❌ Checkbox lists for agents (they don't check boxes, they execute)
- ❌ Numbered subtasks (1.1, 1.2, 1.3) - too granular for agent sessions
- ❌ Vague instructions ("fix this" without specifics)
- ❌ Multiple independent fixes in one task (merge them into flowing narrative)
- ❌ Missing verification steps (always provide test commands)
- ❌ Hardcoded versions or file paths (use variables or search instructions)

### PR #15 Results

**Second Review Cycle (13 issues discovered):**
- Phase 5 (CRITICAL): 5 fixes → 0 failures ✅
- Phase 6 (HIGH): 6 fixes → 0 failures ✅
- Phase 7 (MEDIUM): 3 fixes → 0 failures ✅
- All 14 Markdown Tasks executed successfully
- 11 commits pushed to origin
- 100% issue resolution rate

**Total Session Duration:** ~4 hours from issue discovery to full resolution and push

