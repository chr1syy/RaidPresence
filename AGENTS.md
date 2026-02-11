# AGENTS.md - RaidPresence

## Project Overview

**RaidPresence** is a Discord bot for World of Warcraft raid attendance management using a **reverse sign-up** system. Instead of requiring raiders to opt-in, everyone on the roster is automatically signed up and must opt-out if they can't attend.

- **Language:** TypeScript
- **Runtime:** Node.js 18+
- **Framework:** discord.js v14
- **Database:** PostgreSQL (production) / SQLite (local dev) via Prisma ORM
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
│   │   └── selectHandler.ts       # Select menu interactions (class/spec)
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

## Database Schema

Prisma models in `prisma/schema.prisma`:

### Guild
Per-server configuration. Fields: `id`, `name`, `raidRoles`, `raidLeaderRoles`, `language` (en/de), `timezoneOffset`, `archiveChannelId`, `autoArchive`.

### UserPreference
Player class/spec preferences per guild. Fields: `userId`, `guildId`, `username`, `wowClass`, `wowSpec`. Unique on `[userId, guildId]`.

### Raid
Individual raid instances. Fields: `id`, `guildId`, `channelId`, `messageId`, `raidDate`, `description`, `roles`, `status` (open/closed/cancelled), `createdBy`. Template/clone fields: `templateName`, `isTemplate`, `createdFromTemplateId`, `clonedAt`. Archive fields: `archivedAt`, `archiveChannelId`, `archiveMessageId`, `isPinned`. Indexed on `[guildId, status]`, `[raidDate]`, `[guildId, raidDate]`, `[guildId, archivedAt]`.

### BadgeType (Enum)
12 badge types:
- `PERFECT_ATTENDANCE`
- `TANK_MAIN`
- `HEALER_HERO`
- `DAMAGE_DEALER`
- `SHARPSHOOTER`
- `ALWAYS_ON_TIME`
- `EARLY_BIRD`
- `TEAM_PLAYER`
- `RELIABLE_MEMBER`
- `RISING_STAR`
- `VETERAN_RAIDER`
- `LEADERS_CHOICE`

### Badge
Player badge awards. Fields: `id`, `userId`, `guildId`, `badgeType`, `earnedAt`, `awardedBy`, `reason`. Unique on `[userId, guildId, badgeType]`. Indexed on `[userId, guildId]`, `[guildId, badgeType]`.

### PlayerBadgeView
Denormalized badge summary for quick embed rendering. Fields: `userId`, `guildId`, `badges` (JSON array), `updatedAt`. Composite PK on `[userId, guildId]`.

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
- **`/raid pin raid_id:`** - Archive a raid (copy to archive channel, remove original)
- **`/raid unpin raid_id:`** - Restore archived raid to original channel
- **`/raid search query: period:`** - Search archived raids by name/player/date
- **`/config archive-channel channel:`** - Set guild archive channel
- **`/config auto-archive enabled:`** - Toggle auto-archive on raid close
- `archiveManager.ts` - `archiveRaid()`, `unarchiveRaid()`, `searchArchive()`, `getArchiveStats()`, `setupArchiveChannel()`
- `archiveFormatter.ts` - Archive search result embeds with pagination
- Auto-archive integrated into `raidScheduler.ts` `checkAndCloseExpiredRaids()`
- Guild isolation enforced on all archive operations
- Database migration: `20260210150000_add_archive_fields`

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
| `pin` | Leader role | Archive a raid |
| `unpin` | Leader role | Restore archived raid |
| `search` | Any member | Search archived raids |

### `/config` Subcommands (6 total)

| Subcommand | Permission | Description |
|-----------|-----------|-------------|
| `raid-roles` | Admin | Set roles scanned for raids |
| `leader-roles` | Admin | Set roles that can manage raids |
| `timezone` | Admin | Set server timezone offset |
| `language` | Admin | Set bot language (en/de) |
| `archive-channel` | Admin | Set archive channel |
| `auto-archive` | Admin | Toggle auto-archive |

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
- 632+ tests total
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

### Environment Variables
Copy `.env.example` to `.env` and configure:
- `DISCORD_TOKEN` - Bot token
- `CLIENT_ID` - Application client ID
- `DATABASE_URL` - PostgreSQL connection string
- `GUILD_ID` - (optional) Guild ID for guild-specific command deployment

---

## Architecture Decisions

- **Reverse sign-up** instead of opt-in reduces friction and improves raid planning visibility
- **Separate formatter modules** per feature (stats, attendance, composition, archive, notes) for independent testing and maintenance
- **Guild isolation** enforced at query level on every database operation
- **Auto-archive** integrated into existing scheduler (no separate cron) with graceful failure that doesn't block raid closure
- **Localization** centralized in one module with type-safe translation keys
- **Prisma** over raw SQL for type safety and migration management
- **No caching layer** - relies on database indexes and Prisma query optimization; cache can be added later if needed
