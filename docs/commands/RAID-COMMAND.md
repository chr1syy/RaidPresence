---
type: reference
title: /raid Command Reference
created: 2026-02-04
tags:
  - commands
  - raid-management
related:
  - "[[SETUP-GUIDE]]"
  - "[[PLAYER-GUIDE]]"
---

# /raid Command Reference

Main command for creating and managing raid events in RaidPresence.

## Table of Contents

- [/raid create](#raid-create) - Create a new raid event
- [/raid list](#raid-list) - View all upcoming raids
- [/raid delete](#raid-delete) - Permanently delete a raid
- [/raid close](#raid-close) - Close raid to prevent changes
- [/raid cancel](#raid-cancel) - Cancel a raid event
- [/raid remind](#raid-remind) - Send raid reminder
- [/raid refresh](#raid-refresh) - Refresh raid roster

## Overview

The `/raid` command is the primary tool for raid leaders to create and manage raid events. All `/raid` management commands require either:
- Configured raid leader role, OR
- ManageEvents Discord permission

---

## /raid create

Create a new raid event with automatic roster population.

### Syntax

```
/raid create date:YYYY-MM-DD time:HH:MM title:Raid Title [roles:Role1,Role2] [ping_roles:true|false]
```

### Parameters

| Parameter | Required | Type | Format | Description |
|-----------|----------|------|--------|-------------|
| `date` | Yes | Date | YYYY-MM-DD | Raid date (e.g., 2026-01-15) |
| `time` | Yes | Time | HH:MM | Raid time in 24-hour format (e.g., 20:00) |
| `title` | Yes | String | Text | Custom name for the raid event |
| `roles` | No | String | Role names/IDs, comma-separated | Custom Discord roles for this raid (comma-separated). If not specified, uses guild's default raid roles. |
| `ping_roles` | No | Boolean | true\|false | Whether to mention the roles when creating the raid (default: false) |

### Examples

```
/raid create date:2026-01-15 time:20:00 title:Heroic Raid Night

/raid create date:2026-01-20 time:19:30 title:Mythic Progress roles:CoreRaider,Trial

/raid create date:2026-01-22 time:20:00 title:Alt Run roles:Member ping_roles:true
```

### Permissions

Requires configured raid leader role or ManageEvents permission.

### Behavior

- **Role Configuration**: Uses guild's default raid roles (configured via `/config raid-roles`) unless the `roles` parameter is specified
- **Custom Roles**: When `roles` parameter is provided, uses those custom roles for this specific raid instead of guild defaults
- **Roster Population**: Creates an attendance list with all eligible members automatically marked as "attending"
- **Class/Spec Tracking**: Pulls saved class/spec preferences for each member
- **Message Creation**: Posts an interactive raid message with buttons in the channel
- **Pinging**: Optionally mentions the configured roles if `ping_roles` is set to true (does not ping individual members)
- **Confirmation**: Sends a private confirmation message to the creator

### Best Practices

- **Clear Titles**: Use descriptive raid titles (e.g., "Heroic EN" instead of "raid")
- **Correct Timezone**: Ensure bot's timezone is configured for your server (use `/config timezone`)
- **Standard Roles**: Use guild's default raid roles for most raids
- **Custom Roles**: Only use custom `roles` parameter when raid requires different attendees than usual
- **Ping Roles**: Enable `ping_roles` for important raids or announcements

---

## /raid list

View all upcoming raids for the server.

### Syntax

```
/raid list
```

### Output

Shows:
- Raid title and date/time
- Attendance count (attending/total roster)
- Raid ID for use with management commands
- All raids sorted by date (earliest first)

### Example Output

```
Upcoming Raids:
1. Heroic EN - Wed, Jan 15 @ 20:00 [4/10 attending] (ID: abc123xyz)
2. Mythic Progress - Mon, Jan 20 @ 19:30 [6/8 attending] (ID: def456uvw)
3. Alt Run - Wed, Jan 22 @ 20:00 [5/15 attending] (ID: ghi789rst)
```

### Usage

Use the raid ID from this list with other commands like `/raid delete`, `/raid close`, `/raid cancel`, `/raid remind`, and `/raid refresh`.

---

## /raid delete

Permanently delete a raid event.

### Syntax

```
/raid delete raid_id:xyz123
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `raid_id` | Yes | String | The unique ID of the raid (shown in `/raid list`) |

### Permissions

Requires configured raid leader role or ManageEvents permission.

### Effects

- Deletes the raid message from the channel
- Removes all attendance records from database
- Permanently deletes the raid event (cannot be recovered)

### Important Notes

- **Irreversible**: This action cannot be undone. Consider using `/raid cancel` if you want to preserve the raid history.
- **Verify ID**: Always double-check the raid ID before deleting
- **Clean Deletion**: All associated data is completely removed from the database

---

## /raid close

Close a raid to prevent further attendance changes.

### Syntax

```
/raid close raid_id:xyz123
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `raid_id` | Yes | String | The unique ID of the raid |

### Permissions

Requires configured raid leader role or ManageEvents permission.

### Effects

- Disables all interactive buttons on the raid message
- Prevents players from:
  - Opting in/out
  - Marking as late
  - Changing class/spec selection
- Locks the roster for final planning
- Message remains visible with all current data

### Use Cases

- Lock roster before raid starts
- Prevent late sign-ups
- Finalize team composition before raid begins

---

## /raid cancel

Cancel a raid event and notify attendees.

### Syntax

```
/raid cancel raid_id:xyz123
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `raid_id` | Yes | String | The unique ID of the raid |

### Permissions

Requires configured raid leader role or ManageEvents permission.

### Effects

- Marks the raid as cancelled in the embed
- Keeps the raid message visible but indicates cancellation status
- Maintains attendance records for reference and history
- Players can no longer interact with the raid

### Difference from Delete

- **Cancel**: Preserves raid history and data; raid remains visible but inactive
- **Delete**: Completely removes raid and all data; cannot be recovered

### Use Cases

- Weather or emergency cancellations
- Not enough sign-ups
- Unexpected circumstances requiring raid postponement

---

## /raid remind

Send a reminder message for an upcoming raid.

### Syntax

```
/raid remind raid_id:xyz123
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `raid_id` | Yes | String | The unique ID of the raid |

### Permissions

Requires configured raid leader role or ManageEvents permission.

### Effects

- Posts a reminder message in the channel
- Mentions the raid's configured roles (not individual members)
- Shows raid details (date, time, title)
- Message includes link to original raid post

### Best Practices

- **Timing**: Send reminders 24 hours before raid for maximum effectiveness
- **Frequency**: Don't send too many reminders to avoid spam
- **Context**: Use for important raids or when attendance is low

---

## /raid refresh

Refresh raid roster by re-scanning members and updating the embed.

### Syntax

```
/raid refresh raid_id:xyz123
```

### Parameters

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `raid_id` | Yes | String | The unique ID of the raid |

### Permissions

Requires configured raid leader role or ManageEvents permission.

### Effects

- Re-scans all eligible members based on current raid roles
- Adds new members who now have raid role
- Removes members who no longer have raid role
- Updates the raid embed message with latest design
- Shows count of members added/removed in confirmation

### Use Cases

- Add members who gained raid role after raid creation
- Remove members who lost raid role
- Update embed with latest design/layout changes
- Refresh roster after role changes in Discord
- Update class/spec information

### Important Notes

- **Attendance Preserved**: Members who were opted out remain opted out
- **Role Changes**: Only affects members based on current Discord roles
- **Non-Destructive**: Existing attendance status is preserved when possible

---

## Common Patterns & Tips

### Creating Recurring Raids

Create multiple raids with the same settings:

```bash
# Weekly heroic raid
/raid create date:2026-01-15 time:20:00 title:Weekly Heroic
/raid create date:2026-01-22 time:20:00 title:Weekly Heroic
/raid create date:2026-01-29 time:20:00 title:Weekly Heroic
```

### Managing Trial Runs

Create raids with specific roles:

```bash
/raid create date:2026-01-17 time:19:00 title:Trial Raid roles:Trial
```

### Emergency Refreshes

When roles change in Discord:

```bash
# New members gained Raider role
/raid refresh raid_id:abc123xyz
```

### Pre-Raid Workflow

1. Create raid with `/raid create`
2. Send reminder 24 hours before with `/raid remind`
3. Close raid 1 hour before start with `/raid close`
4. Manage no-shows and feedback
5. Cancel or delete raid when complete

---

## Related Documentation

- [[SETUP-GUIDE]] - Setting up raid roles and permissions
- [[CONFIG-COMMAND]] - Configuring raid settings
- [[PLAYER-GUIDE]] - How players interact with raids
