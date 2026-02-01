---
type: reference
title: 'handleEditRaid() Implementation Guide'
created: 2026-02-01
tags:
  - maintenance
  - architecture
  - code-reference
related:
  - "[[Raid-Architecture]]"
  - "[[handleCreateRaid]]"
  - "[[handleRefreshRaid]]"
---

# handleEditRaid() Function - Maintainer Documentation

## Overview

The `handleEditRaid()` function (lines 1225-1628 in `src/commands/raid.ts`) handles the `/raid edit` slash command, allowing raid leaders to update raid date, time, and title while automatically maintaining roster accuracy.

## Function Location & Signature

```typescript
async function handleEditRaid(interaction: ChatInputCommandInteraction) {
  // Handles the /raid edit subcommand
  // Returns void; sends Discord response via interaction.editReply()
}
```

**File**: `src/commands/raid.ts`  
**Lines**: 1225-1628  
**Dependencies**:
- `ChatInputCommandInteraction` from discord.js
- `prisma` database client
- `canManageRaids()` permission utility
- `createRaidEmbed()` function for visual updates
- `getTranslations()` for localization

## Function Flow Overview

### High-Level Flow

```
1. Basic Validation (guild/channel/member existence)
2. Permission Check (canManageRaids)
3. Parameter Parsing (extract raid_id, date, time, title)
4. Date/Time Format Validation
5. Raid State Validation & Retrieval
6. Date/Time Parsing with Timezone
7. Determine Changes
8. Update Database
9. Member Roster Scanning
10. Database Roster Updates
11. Embed Update
12. Response Message Building
```

## Detailed Code Sections

### Section 1: Initial Validation (Lines 1226-1243)

```typescript
if (!interaction.guild || !interaction.channel) {
  // Guild or channel context required
}

await interaction.deferReply({ ephemeral: true });

const member = interaction.member;
if (!member || !(await canManageRaids(member as any))) {
  // Permission denial
}
```

**Purpose**: Ensure command is used in a server context and user has permission.

**Why Each Check**:
- Guild/Channel check: Slash commands can be used outside servers; we need Discord context
- Permission check: Only raid leaders should edit raids
- Ephemeral reply: Keeps bot logs clean, only user sees the response

### Section 2: Parameter Extraction (Lines 1245-1248)

```typescript
const raidId = interaction.options.get('raid_id', true).value as string;
const dateStr = interaction.options.get('date', false)?.value as string | undefined;
const timeStr = interaction.options.get('time', false)?.value as string | undefined;
const title = interaction.options.get('title', false)?.value as string | undefined;
```

**Purpose**: Extract command parameters from Discord interaction.

**Why This Way**:
- `raid_id` is required (`true`); others are optional (`false`)
- Using optional chaining (`?.`) prevents crashes if optional params not provided
- String casting (`as string`) is safe because Discord validates types

### Section 3: Basic Parameter Validation (Lines 1250-1256)

```typescript
if (!dateStr && !timeStr && !title) {
  await interaction.editReply({
    content: '❌ At least one of date, time, or title must be provided.',
  });
  return;
}
```

**Purpose**: Prevent empty edits with no changes.

**Why This Check**:
- User must intend to change something
- Prevents database unnecessary writes
- Provides clear feedback on command requirements

### Section 4: Date/Time Format Validation (Lines 1261-1275)

```typescript
if (dateStr) {
  const dateError = validateDateFormat(dateStr);
  if (dateError) {
    await interaction.editReply({ content: dateError });
    return;
  }
}

if (timeStr) {
  const timeError = validateTimeFormat(timeStr);
  if (timeError) {
    await interaction.editReply({ content: timeError });
    return;
  }
}
```

**Helper Functions Used**:
- `validateDateFormat(dateStr)`: Checks `YYYY-MM-DD` pattern, valid month/day
- `validateTimeFormat(timeStr)`: Checks `HH:MM` pattern, valid hours/minutes

**Why Early Format Check**:
- Format validation is cheap and catches typos immediately
- Prevents proceeding with invalid data
- Gives user quick feedback to fix input

### Section 5: Comprehensive Raid State Validation (Lines 1280-1320)

```typescript
const raid = await prisma.raid.findUnique({
  where: { id: raidId },
  include: { guild: true, attendance: true },
});

if (!raid) {
  // Raid not found
}

if (raid.guildId !== interaction.guild.id) {
  // Raid belongs to different guild
}

if (raid.status === 'closed' || raid.status === 'cancelled') {
  // Cannot edit closed/cancelled raids
}

if (!raid.messageId) {
  // Warning: embed won't update
}

if (!raid.channelId) {
  // Warning: embed won't update
}
```

**Checks & Their Purpose**:

| Check | Purpose | Why Important |
|-------|---------|---------------|
| `findUnique()` | Fetch raid from DB | Base data for all updates |
| Null check | Raid exists | Can't edit non-existent raid |
| Guild match | Guild isolation | Security: prevent cross-guild edits |
| Status check | Only open raids editable | Audit trail: closed raids locked |
| messageId warning | Embed updateable | UX: warn if embed won't update |
| channelId warning | Channel accessible | UX: warn if can't reach channel |

**Edge Cases Handled**:
- Missing messageId/channelId: Proceed with warning, update DB only
- Closed raid: Reject with clear message

### Section 6: Timezone-Aware Date/Time Parsing (Lines 1330-1372)

```typescript
const existingDate = new Date(raid.raidDate);
const finalDateStr = dateStr || existingDate.toISOString().split('T')[0];
const finalTimeStr = timeStr || existingDate.toISOString().substring(11, 16);

const dateTimeStr = `${finalDateStr}T${finalTimeStr}:00`;
const localDate = new Date(dateTimeStr);

// Apply timezone offset (user enters local time, we store UTC)
const timezoneOffsetHours = guildData.timezoneOffset || 0;
newRaidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));

if (isNaN(newRaidDate.getTime())) {
  // Invalid date math
}

const now = new Date();
if (newRaidDate < now) {
  // Date in past
}

if (newRaidDate > maxFutureDate) {
  // Date too far future (2 years)
}
```

**Timezone Offset Logic** (Critical):

The guild stores `timezoneOffset` (e.g., 2 for UTC+2). When a user enters a local time:

```
User enters: 2025-12-25 19:30 (their local time, UTC+2)
Step 1: Parse as UTC naive: 2025-12-25T19:30:00Z (incorrect UTC)
Step 2: Subtract offset: 19:30 - 2 hours = 17:30 UTC (correct storage)
Result: When user sees timestamp, Discord adjusts back to their timezone
```

**Why This Approach**:
- Consistent UTC storage in database
- Discord timestamps automatically format to user's local timezone
- Guild can have members in different timezones; UTC is universal

**Future Date Validation**:
- Prevents past dates (raid already happened)
- Prevents dates >2 years future (likely mistakes, prevents spam)
- Check `newRaidDate !== raid.raidDate` to avoid unnecessary updates

### Section 7: Building Change Tracking (Lines 1375-1388)

```typescript
const updateData: any = {};
const changes: string[] = [];
let newRaidDate: Date | null = null;

if (newRaidDate.getTime() !== raid.raidDate.getTime()) {
  updateData.raidDate = newRaidDate;
  changes.push(`Date/time updated to <t:${Math.floor(newRaidDate.getTime() / 1000)}:F>`);
}

if (title && title !== raid.description) {
  updateData.description = title;
  changes.push(`Title updated to "${title}"`);
}

if (changes.length === 0) {
  // No actual changes
  await interaction.editReply({
    content: '❌ No changes requested. Please specify at least one new value that differs from current.',
  });
  return;
}
```

**Purpose**: Track what's actually changing for user feedback and to avoid empty updates.

**Why This Pattern**:
- Only update fields that changed
- Provides audit trail (what changed)
- Prevents user confusion ("I ran the command but nothing happened")
- Efficient database writes

### Section 8: Database Raid Update (Lines 1391-1394)

```typescript
await prisma.raid.update({
  where: { id: raidId },
  data: updateData,
});
```

**What Gets Updated**: Only fields in `updateData` (date/time, title, or both).

**Why Simple Update**:
- Roles are immutable (by design)
- Status unchanged (only date/time/title change)
- Timestamps auto-handled by Prisma

**Important**: This happens BEFORE roster scanning, so database is consistent before member changes.

### Section 9: Member Scanning Algorithm (Lines 1400-1442)

```typescript
const roleSource = raid.roles && raid.roles.trim().length > 0
  ? raid.roles
  : guildData.raidRoles;
const roleIds = roleSource.split(',').map((r: string) => r.trim()).filter(Boolean);

let currentEligibleMembers = new Set<string>();
let rosterScanError: string | null = null;

try {
  if (roleIds.length > 0) {
    await interaction.guild.members.fetch();

    for (const [memberId, guildMember] of interaction.guild.members.cache) {
      if (guildMember.user.bot) continue;

      const hasRaidRole = guildMember.roles.cache.some((role) =>
        roleIds.includes(role.id) || roleIds.includes(role.name)
      );

      if (hasRaidRole) {
        currentEligibleMembers.add(memberId);
      }
    }
  } else {
    // Include all non-bot members
    await interaction.guild.members.fetch();
    for (const [memberId, guildMember] of interaction.guild.members.cache) {
      if (!guildMember.user.bot) {
        currentEligibleMembers.add(memberId);
      }
    }
  }
} catch (error) {
  console.error('Error during member scanning:', error);
  rosterScanError = '⚠️ Could not scan member roster due to an error. Database changes saved.';
}
```

**Algorithm Breakdown**:

1. **Role Source Selection**:
   - Use raid-specific roles if defined
   - Fall back to guild default roles
   - Split comma-separated string into array

2. **Member Fetch**:
   - Call `.fetch()` to ensure cache is complete
   - This is necessary because partial guild member cache would miss people

3. **Eligibility Check**:
   - Skip bots (never in raids)
   - Check if member has ANY of the raid roles (by ID or name)
   - Build set of eligible user IDs

4. **No-Roles Fallback**:
   - If guild has no roles configured, include all non-bot members
   - This allows raids without specific role restrictions

**Error Handling**:
- Catch scanning errors (Discord API issues)
- Store error but continue
- Database changes already saved at this point

**Performance Notes**:
- Uses Set for O(1) membership checks later
- `.fetch()` is async and required for cache accuracy
- Handles both role IDs and role names for flexibility

### Section 10: Finding Members to Add/Remove (Lines 1444-1456)

```typescript
const currentAttendance = raid.attendance;
const currentAttendanceIds = new Set(currentAttendance.map((a) => a.userId));

const membersToAdd = Array.from(currentEligibleMembers).filter(
  (memberId) => !currentAttendanceIds.has(memberId)
);

const membersToRemove = currentAttendance.filter(
  (a) => !currentEligibleMembers.has(a.userId)
);
```

**Logic**:

```
membersToAdd = (current eligible) - (current attendance)
membersToRemove = (current attendance) - (current eligible)
```

**Example**:
- Eligible now: {User1, User2, User3, User4}
- Attendance before: {User1, User2, User5}
- membersToAdd: {User3, User4}
- membersToRemove: {User5}

**Why This Pattern**:
- Clear set operations
- Efficient with Set operations
- Easy to understand business logic

### Section 11: Creating New Attendance Records (Lines 1458-1517)

```typescript
for (const userId of membersToAdd) {
  const guildMember = interaction.guild.members.cache.get(userId);
  if (guildMember) {
    await prisma.userPreference.upsert({
      where: {
        userId_guildId: { userId, guildId: interaction.guild.id },
      },
      update: { username: guildMember.displayName },
      create: {
        userId,
        guildId: interaction.guild.id,
        username: guildMember.displayName,
      },
    });
  }
}

const newMemberIds = Array.from(membersToAdd);
const userPrefs = await prisma.userPreference.findMany({
  where: {
    guildId: interaction.guild.id,
    userId: { in: newMemberIds },
  },
});

const prefsMap = new Map(userPrefs.map(pref => [pref.userId, pref]));

const attendanceData = newMemberIds
  .map((userId) => {
    const guildMember = interaction.guild!.members.cache.get(userId);
    if (!guildMember) return null;

    const pref = prefsMap.get(userId);
    return {
      raidId: raid.id,
      userId,
      guildId: interaction.guild!.id,
      username: guildMember.displayName,
      status: 'attending' as const,
      wowClass: pref?.wowClass || null,
      wowSpec: pref?.wowSpec || null,
    };
  })
  .filter((data) => data !== null);

if (attendanceData.length > 0) {
  await prisma.raidAttendance.createMany({
    data: attendanceData,
  });
}
```

**Steps**:

1. **Upsert UserPreferences**:
   - Ensures every new member has a UserPreference record (required for FK)
   - Updates username if member changed display name
   - Creates record if first time seeing member

2. **Fetch Preferences**:
   - Get class/spec for all new members in batch (efficient)
   - Create map for O(1) lookup

3. **Build Attendance Records**:
   - Map new members to attendance objects
   - Include their class/spec from preferences (or null)
   - Set status to "attending" (default for new members)
   - Filter out any null entries from `members.cache.get()` failures

4. **Batch Insert**:
   - `createMany()` is atomic and efficient
   - Only runs if there are actual records

**Why This Pattern**:
- UserPreference upsert ensures FK constraint satisfied
- Batch fetch is more efficient than individual queries
- Map avoids N+1 lookup problem
- Filter removes edge case where member left guild

### Section 12: Removing Ineligible Members (Lines 1519-1527)

```typescript
if (membersToRemove.length > 0) {
  const memberIdsToRemove = membersToRemove.map(attendance => attendance.id);
  await prisma.raidAttendance.deleteMany({
    where: {
      id: { in: memberIdsToRemove },
    },
  });
}
```

**Purpose**: Remove attendance records for members no longer eligible.

**Why This Approach**:
- Delete by primary key `id` (efficient)
- Batch delete with `deleteMany` (single query)
- Removes all data for that member-raid combination

**Cascade Behavior**:
- Deletion is cascading (Prisma schema configured)
- No orphaned records left behind

### Section 13: Embed Update (Lines 1532-1586)

```typescript
let embedUpdateStatus = '';
if (raid.messageId && raid.channelId) {
  try {
    const channel = await interaction.client.channels.fetch(raid.channelId);
    if (channel?.isTextBased() && 'messages' in channel) {
      try {
        const message = await channel.messages.fetch(raid.messageId);
        const embed = await createRaidEmbed(raid.id, guildData.language);

        const trans = getTranslations(guildData.language);

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
          // Button definitions...
        );

        await message.edit({ embeds: [embed], components: [buttons] });
        embedUpdateStatus = '✓ Embed updated';
      } catch (messageError) {
        console.error('Error fetching raid message:', messageError);
        embedUpdateStatus = '⚠️ Could not fetch/update embed message (it may have been deleted)';
      }
    } else {
      embedUpdateStatus = '⚠️ Could not access channel to update embed';
    }
  } catch (channelError) {
    console.error('Error fetching channel:', channelError);
    embedUpdateStatus = '⚠️ Could not access channel (may have been deleted or no permissions)';
  }
}
```

**Error Handling Strategy** (Nested try-catch):

1. **Outer try**: Channel fetch
   - Channel might not exist or be inaccessible
   - Catches permission issues, deleted channels

2. **Inner try**: Message fetch + edit
   - Message might be deleted
   - Edit operation might fail
   - Database is already saved, so failure here is non-critical

**Why Not Re-ping**:
- Edit updates in-place, doesn't create new message
- No role mentions in content
- Prevents spam/notification overload
- Original raid notification already sent

**Localization**:
- Fetches translations for button labels
- Matches guild's language preference

### Section 14: Final Response Message (Lines 1591-1627)

```typescript
let finalMessage = '✅ Raid updated successfully!\n\n';

finalMessage += '**Updated Fields:**\n';
if (changes.length > 0) {
  finalMessage += changes.map(c => `• ${c}`).join('\n');
}

const addedCount = membersToAdd.length;
const removedCount = membersToRemove.length;
if (addedCount > 0 || removedCount > 0) {
  finalMessage += '\n\n**Roster Changes:**\n';
  if (addedCount > 0) finalMessage += `• Added ${addedCount} member(s)\n`;
  if (removedCount > 0) finalMessage += `• Removed ${removedCount} member(s)`;
}

if (embedUpdateStatus) {
  finalMessage += `\n\n**Embed Status:** ${embedUpdateStatus}`;
}

if (rosterScanError) {
  finalMessage += `\n\n${rosterScanError}`;
}

finalMessage += `\n\n**Raid ID:** \`${raid.id}\``;
if (newRaidDate) {
  const timestamp = Math.floor(newRaidDate.getTime() / 1000);
  finalMessage += `\n**New Timestamp:** <t:${timestamp}:F>`;
}

await interaction.editReply({ content: finalMessage });
```

**Message Structure**:

```
✅ Raid updated successfully!

**Updated Fields:**
• Date/time updated to <timestamp>
• Title updated to "New Title"

**Roster Changes:**
• Added 2 member(s)
• Removed 1 member(s)

**Embed Status:** ✓ Embed updated

**Raid ID:** `abc123xyz`
**New Timestamp:** <t:1735128600:F>
```

**Why This Format**:
- Hierarchical (main result → details → metadata)
- Clear status indicators (✓, •, **bold** sections)
- Includes timestamps for verification
- Raid ID for reference/debugging

## Key Design Decisions

### 1. Roles Are Immutable

**Decision**: Raid roles cannot be changed via edit.

**Rationale**:
- Preserves original raid composition intent
- Prevents accidental changes to who's invited
- If roles need changing, create a new raid
- Simplifies state management

**Implementation**: Only `raidDate` and `description` updated, never `roles`.

### 2. Member Status Changes Not Preserved for Removed Members

**Decision**: When a member loses their role and gets re-added, they start as "attending".

**Rationale**:
- Prevents status inflation (late members re-added as late)
- Force explicit status response after change
- Simpler logic, fewer edge cases

**Implementation**: Removed members deleted entirely; if re-added, get fresh "attending" status.

### 3. Silent Embed Update (No Re-ping)

**Decision**: Edit updates the message in-place; doesn't send new message or re-mention roles.

**Rationale**:
- Prevents notification spam
- Users already saw original announcement
- Changes are incremental, not major
- In-place edits show clear "before/after"

**Implementation**: Call `message.edit()` instead of re-sending; no role mentions in content.

### 4. Timezone Offset Applied During Parse

**Decision**: User enters local time; offset applied during storage conversion to UTC.

**Rationale**:
- Single source of truth: UTC storage
- Handles multi-timezone guilds
- Discord timestamps auto-adjust to user's timezone
- Consistent with create flow

**Implementation**: `new Date(localTime - (offsetHours * ms_per_hour))`

### 5: Batch Operations for Efficiency

**Decision**: Use `createMany()` and `deleteMany()` instead of looping.

**Rationale**:
- Single database round trip per operation
- Atomic transactions
- Scales better with large rosters

**Implementation**: Build array of objects, then `createMany()/deleteMany()` once.

## Common Bugs & Prevention

### Bug 1: Timezone Offset Direction

**Wrong**:
```typescript
newRaidDate = new Date(localDate.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));
```

**Right**:
```typescript
newRaidDate = new Date(localDate.getTime() - (timezoneOffsetHours * 60 * 60 * 1000));
```

**Why**: UTC+2 means local is 2 hours ahead; we subtract to go back to UTC.

### Bug 2: Forgetting to Filter Null Attendance Records

**Wrong**:
```typescript
const attendanceData = newMemberIds.map(userId => {
  // ... might return null
});
await prisma.raidAttendance.createMany({ data: attendanceData });
```

**Right**:
```typescript
const attendanceData = newMemberIds
  .map(userId => { /* ... */ })
  .filter((data) => data !== null);
```

**Why**: Null values cause database errors; filter them out.

### Bug 3: Comparing Dates with !==

**Wrong**:
```typescript
if (newRaidDate !== raid.raidDate) {
  // Both are Date objects; !== always true
}
```

**Right**:
```typescript
if (newRaidDate.getTime() !== raid.raidDate.getTime()) {
  // Compare milliseconds
}
```

**Why**: Date objects are references; compare `.getTime()` for values.

## Testing Considerations

### Unit Tests Needed

1. **Timezone Calculations**: Verify offset math for various timezones
2. **Member Scanning**: Test add/remove/mixed scenarios
3. **Date Validation**: Past dates, far future, invalid formats
4. **No Changes**: Identical values provided
5. **Permission Checks**: User without canManageRaids
6. **Embed Updates**: Message deleted, channel deleted, permissions
7. **Database Rollback**: Handle failures gracefully

### Manual Test Cases

1. Edit time only (date/title unchanged)
2. Edit all three fields
3. Edit when members gained/lost roles
4. Edit with bot without message permissions
5. Edit closed raid (should fail)
6. Edit with timezone offset (verify storage)

## Performance Notes

- **Member fetch**: O(guild_size) - expensive, only done once per edit
- **Set operations**: O(n log n) for building eligibility set
- **Database updates**: Single update query + batch inserts/deletes
- **Embed update**: Single API call to edit message
- **Total**: ~200-500ms for typical 50-member raid

## Future Improvements

1. **Cache guild members**: Avoid re-fetching on every raid operation
2. **Async member scanning**: Don't block on Discord API
3. **Partial embeds**: Only rebuild changed fields
4. **Audit logging**: Track who edited what and when
5. **Edit history**: Allow reverting to previous states

---

**Related Functions**:
- `handleCreateRaid()`: Initial raid creation (similar flow)
- `handleRefreshRaid()`: Manual roster refresh (member scanning logic)
- `createRaidEmbed()`: Builds visual embed
- `buildRoleMentions()`: Converts role IDs to mentions

**Last Updated**: 2026-02-01
