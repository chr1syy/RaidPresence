# AGENT.md - RaidPresence Phase 2 Architecture

## Overview

This document describes the architecture of Phase 2 features for RaidPresence, which add advanced engagement features, data-driven insights, and raid organization capabilities.

### Phase 2 Features

1. **Player Attendance History & Trends** - Track player reliability and participation patterns
2. **Class/Spec Recommendations & Composition Hints** - Analyze raid composition and suggest improvements
3. **Optional Raid Notes / Opt-Out Comments** - Allow players to provide context for their decisions
4. **Raid Pinning / Archive System** - Keep raid history organized with searchable archives

---

## Architecture Overview

### Module Structure

Phase 2 introduces 5 new utility modules for analytics and management:

```
src/utils/
├── attendanceAnalytics.ts         # Player attendance & trend calculation
├── attendanceFormatter.ts         # Embed formatting for attendance
├── compositionAnalyzer.ts         # Raid composition analysis
├── compositionFormatter.ts        # Embed formatting for composition
├── archiveManager.ts              # Archive operations (pin/unpin/search)
├── archiveFormatter.ts            # Embed formatting for archives
├── notesFormatter.ts              # Embed formatting for notes
└── __tests__/
    ├── attendanceAnalytics.test.ts
    ├── compositionAnalyzer.test.ts
    ├── archiveManager.test.ts
    └── (integration tests in src/commands/__tests__/integration/)
```

### Data Flow Diagrams

#### 1. Attendance Analytics Flow
```
RaidAttendance records
  ↓
getPlayerAttendanceHistory()
  ↓
calculatePlayerStats()
  ├─ attendance rate %
  ├─ reliability score
  ├─ trend indicator
  └─ response time metrics
  ↓
formatAttendanceEmbed()
  ↓
Discord Embed
```

#### 2. Composition Analysis Flow
```
Raid with RaidAttendance records
  ↓
analyzeRaidComposition()
  ├─ count by role
  └─ identify gaps/overages
  ↓
findCompositionGaps()
  ↓
suggestPlayerSwaps()
  ├─ from opted-out players
  └─ ranked by flexibility
  ↓
formatCompositionEmbed()
  ↓
Discord Embed
```

#### 3. Archive System Flow
```
Raid
  ↓
archiveRaid()
  ├─ fetch original message
  ├─ copy to archive channel
  ├─ update database
  └─ delete original
  ↓
searchArchive()
  ├─ by date range
  ├─ by query (name/player)
  └─ with pagination
  ↓
formatArchiveSearchEmbed()
  ↓
Discord Embed
```

---

## Database Schema Changes

### New Fields in `RaidAttendance`

```prisma
model RaidAttendance {
  // ... existing fields ...
  
  // Phase 2: Notes & Comments
  optoutReason    String?         // Player's reason for opting out (max 100 chars)
  playerNote      String?         // Player's comment on their status
  notedAt         DateTime?       // When note was added
  updatedAt       DateTime        @updatedAt  // Track when attendance last changed
}
```

### New Fields in `Raid`

```prisma
model Raid {
  // ... existing fields ...
  
  // Phase 2: Archive System
  archivedAt        DateTime?       // When raid was archived
  archiveChannelId  String?         // Channel where archived message lives
  archiveMessageId  String?         // Message ID of archived embed
  isPinned          Boolean         @default(false)  // Is raid archived?
  
  @@index([guildId, raidDate])      // For attendance date-range queries
  @@index([guildId, archivedAt])    // For archive queries
}
```

### New Fields in `Guild`

```prisma
model Guild {
  // ... existing fields ...
  
  // Phase 2: Archive System Configuration
  archiveChannelId  String?         // Guild's designated archive channel
  autoArchive       Boolean         @default(false)  // Auto-archive on close?
}
```

### Database Indexes

Added for performance:
- `Raid(guildId, raidDate)` - Efficient date-range queries for attendance
- `Raid(guildId, archivedAt)` - Efficient archive lookups
- `RaidAttendance(userId, guildId, status)` - Already existed from Phase 1

---

## Module Descriptions

### 1. attendanceAnalytics.ts

**Purpose:** Calculate player statistics and trends from attendance data.

**Key Functions:**

- `getPlayerAttendanceHistory(userId, guildId, days?)` 
  - Returns array of raids attended/missed with timestamps
  - Filters by time period (30/90/all days)
  - Includes status: attending/opted_out/late

- `calculatePlayerStats(userId, guildId, period?)`
  - Returns comprehensive player statistics
  - Attendance rate %, reliability score, trend indicator
  - Response time metrics
  - Trend analysis with confidence score

- `getPlayerRoleDistribution(userId, guildId)`
  - Main role (most common class/spec)
  - Alt roles (secondary specs)
  - Flexibility score (can they fill multiple roles?)

- `getTrendData(userId, guildId, period=90)`
  - Weekly attendance rate trends
  - Improving/declining/stable indicator
  - Confidence score for trend

**Dependencies:**
- `getSpecRole()` from wowData.ts
- `getTranslations()` for localization

**Performance Notes:**
- Uses efficient database queries with proper indexes
- O(n) complexity where n = raids in period (typically <200)
- Average execution: <50ms for 1000-player guild

### 2. attendanceFormatter.ts

**Purpose:** Format attendance statistics into Discord embeds.

**Key Functions:**

- `formatAttendanceEmbed(playerName, stats, period, language)`
  - Returns EmbedBuilder with color-coded reliability score
  - Fields for attendance %, reliability tier, trend, roles, response time
  - Last 5 raids attended/missed
  - Period footer with disclaimer

**Design Notes:**
- Color coding: 🟢 Green (Highly Reliable), 🟡 Yellow (Reliable), 🔴 Red (Inconsistent)
- Supports EN/DE localization via getTranslations()
- Inline layout for space efficiency

### 3. compositionAnalyzer.ts

**Purpose:** Analyze raid composition and suggest improvements.

**Key Functions:**

- `analyzeRaidComposition(raid)`
  - Current counts (tanks, healers, melee, ranged)
  - Inventory counts
  - Status flags: READY, NEEDS_X, OVERSTOCKED_X

- `getOptimalComposition(raidSize)`
  - For 10-man: 2 tanks, 2-3 healers, 5-6 DPS
  - For 20-man: 2 tanks, 4-5 healers, 13-14 DPS
  - Flexible: varies based on difficulty

- `findCompositionGaps(raid)`
  - Which roles are short-staffed?
  - By how many?
  - Which specs would help?

- `suggestPlayerSwaps(raid, attendees, optedOut)`
  - Look at opted-out players
  - Identify those who could help fill gaps
  - Return ranked list with flexibility notes

- `calculateSuccessLikelihood(raid)`
  - Estimate raid success based on composition
  - Return percentage (0-100%)
  - Based on role balance and full roster

**Dependencies:**
- `getSpecRole()`, `getSpecsForClass()` from wowData.ts
- `calculateComposition()` (exported for reusability)

**Algorithm Notes:**
- Success likelihood factors:
  - Composition balance (40%)
  - Healer-to-DPS ratio (30%)
  - Tank coverage (20%)
  - Flexibility (10%)

### 4. compositionFormatter.ts

**Purpose:** Format composition analysis into Discord embeds.

**Key Functions:**

- `formatCompositionEmbed(raid, analysis, suggestions, language)`
  - Title: "Raid Composition Analysis: {raidName}"
  - Current vs optimal composition with role counts
  - Status indicator (green for READY, orange for NEEDS)
  - Top 5 player suggestions with flexibility scores
  - Success likelihood percentage
  - Improvement suggestions

**Design Notes:**
- Role emojis: 🛡️ Tanks, 💚 Healers, ⚔️ DPS
- Color coding: green (READY), orange (NEEDS), gray (OVERSTOCKED)
- Shows which players are available to fill gaps

### 5. archiveManager.ts

**Purpose:** Manage raid archival, restoration, and searching.

**Key Functions:**

- `archiveRaid(raidId, guildId, client)`
  - Fetch original message from raid channel
  - Create embed copy in archive channel
  - Delete original message
  - Update database with archive info
  - Guild isolation check enforced

- `unarchiveRaid(raidId, guildId, client)`
  - Fetch archive message
  - Repost to original channel
  - Update database
  - Delete from archive
  - Guild isolation check enforced

- `getArchiveChannel(guildId, client)`
  - Validate channel exists
  - Check bot permissions
  - Return configured channel or throw error

- `setupArchiveChannel(guildId, channelId, client)`
  - Validate channel is text channel
  - Validate bot has permissions
  - Update guild config

- `searchArchive(filters)`
  - By date range (startDate, endDate)
  - By query (name or player names)
  - Pagination (5 participants max)
  - Returns raid summaries with attendance %

- `getArchiveStats(guildId)`
  - Total archived count
  - Recent (30-day) count

**Guild Isolation:**
All operations verify `raid.guildId === guildId` to prevent cross-guild attacks.

**Performance Notes:**
- Archive queries use `Raid(guildId, archivedAt)` index
- Search pagination: max 10 results per query
- Date range queries efficient with proper indexes

### 6. archiveFormatter.ts

**Purpose:** Format archive operations into Discord embeds.

**Key Functions:**

- `formatArchiveSearchEmbed(results, query, period, language)`
  - Title: "Archive Search Results"
  - List raids with date, name, attendance %, key participants
  - Pagination info if >10 results
  - Copyable raid IDs

- `formatArchiveNotificationEmbed(raid, language)`
  - Simple confirmation: "Raid archived to {archiveChannel}"

**Design Notes:**
- Gray color (0x95a5a6) for archive theme
- EN/DE localization supported

### 7. notesFormatter.ts

**Purpose:** Format raid notes into Discord embeds.

**Key Functions:**

- `formatRaidNotesEmbed(raid, notes, language)`
  - Separates opt-out reasons and player comments
  - Format: "Player: Note"
  - Handles long text with truncation

---

## Command Architecture

### New Subcommands

Added to `/raid` command:

| Subcommand | Purpose | Parameters |
|-----------|---------|-----------|
| `attendance` | View player attendance history | player (user), period (optional) |
| `suggest` | Get composition recommendations | raid_id (string) |
| `notes` | View all notes for a raid | raid_id (string) |
| `pin` | Archive a raid | raid_id (string) |
| `unpin` | Restore an archived raid | raid_id (string) |
| `search` | Search archived raids | query (optional), period (optional) |

Added to `/config` command:

| Subcommand | Purpose | Parameters |
|-----------|---------|-----------|
| `archive-channel` | Set archive channel | channel (channel) |
| `auto-archive` | Enable/disable auto-archive | enabled (boolean) |

### Handler Implementation Pattern

Each handler follows this pattern:

```typescript
async function handleXxxCommand(interaction: ChatInputCommandInteraction) {
  try {
    // 1. Validate permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: trans.noPermission, ephemeral: true });
    }

    // 2. Extract parameters
    const raidId = interaction.options.getString('raid_id');
    
    // 3. Fetch data (with guild isolation check)
    const raid = await db.raid.findFirst({
      where: { id: raidId, guildId: interaction.guildId }
    });
    if (!raid) return interaction.reply({ content: trans.raidNotFound, ephemeral: true });

    // 4. Call utility function
    const analysis = analyzeRaidComposition(raid);

    // 5. Format response
    const embed = formatCompositionEmbed(raid, analysis, trans);
    
    // 6. Reply to user
    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error(`[${command}]`, error);
    await interaction.reply({ content: trans.errorOccurred, ephemeral: true });
  }
}
```

### Permission Model

- **View Commands** (`attendance`, `stats`, `suggest`, `notes`, `search`): All guild members
- **Modify Commands** (`pin`, `unpin`, `config`): Requires `canManageRaids` permission or `Administrator`
- **Archive Config** (`archive-channel`, `auto-archive`): Requires `Administrator`

---

## Localization

All Phase 2 features use the centralized `getTranslations()` function with EN/DE support.

**Translation Keys Added:**

### Attendance
- `attendanceRecord`, `raidInvited`, `raidAttended`, `optedOut`, `runningLate`
- `reliabilityScore`, `highlyReliable`, `reliable`, `inconsistent`
- `attendanceTrend`, `mainRole`, `altRoles`, `avgResponseTime`

### Composition
- `compositionAnalysis`, `currentRoster`, `optimalRoster`
- `raidReady`, `needsRole`, `overstaff`, `recommendations`
- `availablePlayers`, `successLikelihood`

### Notes
- `optoutReason`, `raidNotes`, `viewNotes`, `raidNotesPlayerComments`, `raidNotesOptoutReasons`

### Archive
- `archiveSearchResults`, `archivedRaids`, `raidArchived`
- `restoreArchive`, `autoArchiveEnabled`, `autoArchiveDisabled`
- `archiveChannelSet`, `archiveSearchQuery`, `archiveSearchPeriod`

---

## Testing Strategy

### Unit Tests

**Coverage Targets: >85% per module**

- `attendanceAnalytics.test.ts` - 38 tests (97.87% coverage)
  - Player stats calculation
  - Trend detection
  - Role distribution
  - Edge cases (0 raids, perfect attendance, etc.)

- `compositionAnalyzer.test.ts` - 39 tests (98.08% coverage)
  - Composition analysis
  - Gap detection
  - Player suggestions
  - Success likelihood

- `archiveManager.test.ts` - 17 tests (89.06% coverage)
  - Archive operations
  - Search filters
  - Guild isolation
  - Error handling

- `attendanceFormatter.test.ts` - 40 tests (97.05% coverage)
  - Embed formatting
  - Color coding
  - Localization
  - Edge cases

- `compositionFormatter.test.ts` - Coverage via integration tests
- `notesFormatter.test.ts` - Coverage via integration tests
- `archiveFormatter.test.ts` - Coverage via integration tests

### Integration Tests

**Location:** `src/commands/__tests__/integration/`

- `raid-attendance.integration.test.ts` - 9 tests
  - End-to-end attendance command workflow
  - Period filtering
  - Localization

- `raid-suggest.integration.test.ts` - 15 tests
  - End-to-end suggestion command
  - Composition analysis
  - Embed formatting
  - Error handling

- `raid-notes.integration.test.ts` - 12 tests
  - Note display in embeds
  - Modal submission
  - Opt-out reason storage

- `raid-archive.integration.test.ts` - 13 tests
  - Pin/unpin workflow
  - Search functionality
  - Archive config commands

### Test Coverage Summary

- **Total Tests:** 632 (Phase 1: 391, Phase 2: 241)
- **Overall Coverage:** 78.15%
- **Phase 2 Coverage:** >85% for all critical modules

---

## Performance Considerations

### Query Optimization

1. **Attendance Queries**
   - Uses `Raid(guildId, raidDate)` index for date-range queries
   - Typical query: <50ms for 1000-player guild

2. **Archive Queries**
   - Uses `Raid(guildId, archivedAt)` index for archive lookups
   - Search pagination: max 10 results
   - Date range filters reduce result set before pagination

3. **Composition Analysis**
   - No N+1 queries (all relations fetched upfront)
   - Average execution: <100ms

### Embed Rendering

- All embeds generated in <500ms
- Discord API call overhead: ~100-200ms (not included in timings above)

### Memory Usage

- Archive search results cached in memory only during command execution
- No persistent caching layer (relies on Prisma query cache)

---

## Common Patterns

### Guild Isolation Pattern

Always verify guild ownership before operations:

```typescript
const raid = await db.raid.findFirst({
  where: { 
    id: raidId,
    guildId: interaction.guildId  // CRITICAL
  }
});
```

### Localization Pattern

Use getTranslations() for all user-facing strings:

```typescript
const trans = getTranslations(interaction.locale || 'en');
const embed = new EmbedBuilder()
  .setTitle(trans.attendanceRecord.replace('{playerName}', playerName));
```

### Error Handling Pattern

Always catch errors and reply with ephemeral messages:

```typescript
try {
  // ... operation ...
} catch (error) {
  console.error(`[Command]`, error);
  await interaction.reply({ 
    content: trans.errorOccurred, 
    ephemeral: true 
  });
}
```

---

## Scheduler Integration

### Auto-Archive Feature

Integrated into `raidScheduler.ts` `checkAndCloseExpiredRaids()`:

```typescript
if (raid.guild.autoArchive && raid.guild.archiveChannelId) {
  try {
    await archiveRaid(raid.id, raid.guildId, client);
  } catch (error) {
    console.error(`[AutoArchive]`, error);
    // Archive failure doesn't prevent raid closure
  }
}
```

**Behavior:**
- Runs every 2 minutes with other scheduler tasks
- Respects guild configuration (check both `autoArchive` flag AND `archiveChannelId`)
- Graceful error handling (archive failures don't prevent raid closure)

---

## Migration Guide

### From Phase 1 to Phase 2

**Database:**
1. Run: `npx prisma migrate dev`
   - Creates 3 new migrations
   - Adds columns to RaidAttendance, Raid, Guild
   - Adds new indexes

**Code:**
1. New utilities available: `attendanceAnalytics`, `compositionAnalyzer`, `archiveManager`
2. New formatter utilities: `attendanceFormatter`, `compositionFormatter`, etc.
3. Modal submission handler integrated into buttonHandler.ts

**Features:**
- All Phase 1 features continue to work
- No breaking changes to existing APIs
- New commands are opt-in (server must configure to use)

---

## Decision Log

### Why Optional Notes (Not Required)?

Players should be able to opt-out without explanation. Required notes would create friction and reduce participation.

### Why Composition Analysis Uses Current Data, Not Historical?

Current roster is what matters for upcoming raid success. Historical composition is archived for reference but not used in calculations.

### Why Archive System Separate from Regular Raids?

Keeps active raid list clean for planning while preserving history for analysis. Guild leaders can search archives without clutter from old raids.

### Why Separate Formatters for Each Feature?

Each feature has unique formatting needs:
- Attendance: color-coded reliability tiers
- Composition: role-specific emojis and recommendations
- Archive: pagination and search result layout
Separating allows independent testing and maintenance.

---

## Future Considerations

### Phase 3: Gamification & Polish

Potential enhancements:
- Attendance streaks and badges
- Raid performance metrics (boss progression)
- Guild achievements
- Player ranking system

### Scalability Notes

Current architecture handles:
- **Guilds:** Unlimited
- **Players per guild:** Up to 5000 (tested)
- **Raids per guild:** Unlimited (paginated searches)
- **Attendance records:** Unlimited (indexes ensure <500ms queries)

For performance tuning:
- Consider read replicas for archive searches
- Implement caching layer for frequently accessed stats
- Add database connection pooling at scale

---

## Debugging

### Enable Query Logging

```bash
DEBUG="prisma:query" npm run dev
```

### Check Archive Status

```typescript
const stats = await getArchiveStats(guildId);
console.log(`Total archived: ${stats.totalArchived}, Recent: ${stats.recentCount}`);
```

### Verify Guild Isolation

All queries include `guildId` check. Search for "guildId" in source:

```bash
grep -r "guildId.*interaction.guildId" src/
```

---

## Glossary

- **Reliability Score:** Calculated from attendance rate (0-100%) mapped to tiers
- **Trend Indicator:** Based on weekly attendance buckets over 90 days
- **Flexibility Score:** How many different roles a player has played (0-1.0)
- **Composition Gap:** Difference between current and optimal role count
- **Success Likelihood:** Estimated raid success rate based on composition balance
- **Archive:** Moved raid with message copy in designated channel

