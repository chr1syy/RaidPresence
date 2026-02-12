# /raid Command Reference

The `/raid` command is the primary interface for managing World of Warcraft raid events in RaidPresence. It provides comprehensive raid lifecycle management with reverse sign-up functionality.

## Overview

RaidPresence uses a **reverse sign-up system** where all eligible guild members are automatically signed up for raids and must opt-out if they cannot attend. This reduces friction and improves attendance visibility.

## Subcommands

### `create` - Create a New Raid
**Permission:** Raid leader role or Administrator
**Description:** Creates a new raid event with specified date, time, and description.

**Usage:**
```
/raid create
  raid-date: [Date/Time]
  description: [Raid description]
  roles: [Role breakdown, e.g., "2T 4H 14D"]
```

**Example:**
```
/raid create
  raid-date: 2024-02-15 20:00
  description: Molten Core - Full Clear
  roles: 2T 4H 14D
```

### `list` - List Upcoming Raids
**Permission:** Any guild member
**Description:** Displays all upcoming raids for the server.

**Usage:**
```
/raid list
```

### `edit` - Edit Raid Details
**Permission:** Raid leader role or Administrator
**Description:** Modifies an existing raid's date, description, or role breakdown.

**Usage:**
```
/raid edit
  raid_id: [Raid ID from /raid list]
  raid-date: [New date/time] (optional)
  description: [New description] (optional)
  roles: [New role breakdown] (optional)
```

### `delete` - Delete a Raid
**Permission:** Raid leader role or Administrator
**Description:** Permanently removes a raid from the system.

**Usage:**
```
/raid delete
  raid_id: [Raid ID from /raid list]
```

### `close` - Close Raid Sign-ups
**Permission:** Raid leader role or Administrator
**Description:** Locks the raid roster and prevents further changes. This is typically done shortly before the raid starts.

**Usage:**
```
/raid close
  raid_id: [Raid ID from /raid list]
```

### `cancel` - Cancel a Raid
**Permission:** Raid leader role or Administrator
**Description:** Cancels a raid and removes all attendance records.

**Usage:**
```
/raid cancel
  raid_id: [Raid ID from /raid list]
```

### `refresh` - Refresh Raid Roster
**Permission:** Raid leader role or Administrator
**Description:** Updates the raid roster to reflect current guild membership and role changes.

**Usage:**
```
/raid refresh
  raid_id: [Raid ID from /raid list]
```

### `clone` - Clone Existing Raid
**Permission:** Raid leader role or Administrator
**Description:** Creates a new raid by copying an existing raid's configuration with a new date/time.

**Usage:**
```
/raid clone
  raid_id: [Source raid ID]
  raid-date: [New date/time]
```

### `stats` - View Attendance Statistics
**Permission:** Any guild member
**Description:** Displays attendance statistics for the specified raid, including player reliability and class distribution.

**Usage:**
```
/raid stats
  raid_id: [Raid ID from /raid list]
```

### `remind` - Send Raid Reminder
**Permission:** Raid leader role or Administrator
**Description:** Sends a reminder message to all signed-up players. Can include a custom message.

**Usage:**
```
/raid remind
  raid_id: [Raid ID from /raid list]
  message: [Custom reminder message] (optional)
```

### `status` - Raid Status Dashboard
**Permission:** Any guild member
**Description:** Shows a dashboard of upcoming raids with attendance status and role breakdowns.

**Usage:**
```
/raid status
```

### `attendance` - Player Attendance History
**Permission:** Any guild member
**Description:** Displays a player's attendance history and reliability statistics over a specified period.

**Usage:**
```
/raid attendance
  player: [@User mention or username]
  period: [30 days / 90 days / all-time]
```

### `suggest` - Composition Analysis
**Permission:** Any guild member
**Description:** Analyzes raid composition and provides recommendations for optimal player swaps.

**Usage:**
```
/raid suggest
  raid_id: [Raid ID from /raid list]
```

### `notes` - View Raid Notes
**Permission:** Any guild member
**Description:** Displays all opt-out reasons and player notes for a raid.

**Usage:**
```
/raid notes
  raid_id: [Raid ID from /raid list]
```

### `pin` - Archive Raid
**Permission:** Raid leader role or Administrator
**Description:** Archives a raid by moving it to the configured archive channel.

**Usage:**
```
/raid pin
  raid_id: [Raid ID from /raid list]
```

### `unpin` - Restore Archived Raid
**Permission:** Raid leader role or Administrator
**Description:** Restores an archived raid back to the original channel.

**Usage:**
```
/raid unpin
  raid_id: [Raid ID from /raid list]
```

### `search` - Search Archived Raids
**Permission:** Any guild member
**Description:** Searches through archived raids by name, player, or date.

**Usage:**
```
/raid search
  query: [Search term]
  period: [30 days / 90 days / all-time]
```

## Raid Lifecycle

1. **Create** - Raid leader creates the raid event
2. **Sign-ups** - Players can opt-out or provide notes via Discord buttons
3. **Remind** - Optional reminders can be sent to players
4. **Close** - Raid leader locks the roster
5. **Archive** - After completion, raid can be archived for record-keeping

## Permissions

- **Raid Leaders:** Can create, edit, delete, close, cancel, refresh, clone, remind, pin, and unpin raids
- **Members:** Can view raids, stats, attendance, status, suggest, notes, and search archives

## Related Commands

- `/config` - Configure server settings and permissions
- `/setup` - Initial server setup wizard