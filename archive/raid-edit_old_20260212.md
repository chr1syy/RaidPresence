---
type: reference
title: '/raid edit' Command Documentation
created: 2026-02-01
tags:
  - raid-management
  - editing
  - user-guide
related:
  - "[[Raid-Creation]]"
  - "[[Raid-Management]]"
---

# `/raid edit` Command Documentation

Edit an existing raid event to update its date, time, or title. This command automatically rescans the member roster for adding new eligible members or removing ineligible ones.

## Command Syntax

```
/raid edit raid_id:[id] [date:[YYYY-MM-DD]] [time:[HH:MM]] [title:[name]]
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `raid_id` | String | ✅ Yes | The ID of the raid to edit (shown in raid list or at bottom of raid embed) |
| `date` | String | ❌ No | New raid date in YYYY-MM-DD format (e.g., `2025-12-25`) |
| `time` | String | ❌ No | New raid time in 24-hour HH:MM format (e.g., `19:30`) |
| `title` | String | ❌ No | New raid title/name (e.g., `Mythic+ Dungeon Run`) |

## Key Requirements

- **At least one parameter must be provided** besides the raid ID. You cannot run the command with only a raid ID.
- All parameters are independent—you can update just the time, just the title, or any combination.
- Date and time must be in the future. Past dates are rejected.

## What Gets Updated

### ✅ Updated During Edit

- **Raid Date/Time**: Stored in UTC using your guild's configured timezone offset. When you enter a local time (in your timezone), it's automatically converted to UTC.
- **Raid Title**: The display name of the raid, shown in the embed and all references.
- **Member Roster**: 
  - **Added**: New members who now have the raid roles are automatically added to the roster with "attending" status.
  - **Removed**: Members who no longer have the raid roles are removed from the roster.
  - **Preserved**: Members still eligible keep their class/spec preferences and current status (attending, late, opted out).

### ❌ NOT Updated During Edit

- **Raid Roles**: The roles configured for this raid do not change. To change roles, you need to create a new raid.
- **Attendance Status**: Only members who are **removed** due to losing the raid role will have their status cleared. Status changes (attending → late, etc.) made before the edit are preserved for members who remain.
- **Raid Descriptions in Mentions**: External references to the raid (in past messages) won't update—only the embed message in the channel updates.
- **Embed Message Location**: The raid embed updates in-place; it's not re-sent or moved to a different location.

## Command Examples

### Example 1: Edit Only the Time

```
/raid edit raid_id:abc123xyz time:19:30
```

**Result**: The raid keeps the same date and title, but the time changes to 7:30 PM (19:30).

### Example 2: Edit Date and Time

```
/raid edit raid_id:abc123xyz date:2025-12-25 time:20:00
```

**Result**: The raid is now scheduled for December 25, 2025 at 8:00 PM (20:00).

### Example 3: Edit Title Only

```
/raid edit raid_id:abc123xyz title:Heroic Raid - Underrot
```

**Result**: The raid keeps the same date/time, but the title updates to "Heroic Raid - Underrot".

### Example 4: Edit All Fields

```
/raid edit raid_id:abc123xyz date:2025-12-25 time:19:30 title:Mythic Raid - New Year
```

**Result**: Everything updates—new date, time, and title. The embed refreshes with the new information.

## Member Roster Changes Example

**Before Edit**:
- Guild has 3 raid roles: @DungeonRaiders, @RaidGroup1, @RaidGroup2
- Current raid members: User1 (has @DungeonRaiders), User2 (has @RaidGroup1), User3 (has @RaidGroup2)

**Edit Action**: User3's @RaidGroup2 role is removed by a guild admin

**After Edit**:
- User3 is removed from the raid roster
- User1 and User2 remain with their status preserved
- If a new user (User4) now has @DungeonRaiders, they're automatically added

## Permission Requirements

You must have the same role(s) configured for "raid creation" to edit raids. Typically, this is a "Raid Leader" or "Officer" role. If you cannot edit a raid, ask your server admin to configure your raid management roles with `/config raid-roles`.

## Troubleshooting

### ❌ "At least one of date, time, or title must be provided"

**Cause**: You ran the command with only the `raid_id` parameter.

**Solution**: Specify at least one change: date, time, or title.

```
✅ /raid edit raid_id:abc123xyz time:19:30
❌ /raid edit raid_id:abc123xyz
```

### ❌ "Invalid date or time format"

**Cause**: Your date or time doesn't match the required format.

**Format Requirements**:
- **Date**: `YYYY-MM-DD` (4-digit year, 2-digit month, 2-digit day)
  - ✅ `2025-12-25` (December 25, 2025)
  - ❌ `12/25/2025` (wrong separator)
  - ❌ `2025-12-1` (month/day need two digits)

- **Time**: `HH:MM` in 24-hour format (2-digit hour, 2-digit minute)
  - ✅ `19:30` (7:30 PM)
  - ✅ `09:00` (9:00 AM)
  - ❌ `9:30` (hour needs two digits)
  - ❌ `19:30:00` (seconds not included)

**Solution**: Use the correct format: `YYYY-MM-DD` for date and `HH:MM` for time.

### ❌ "Raid date must be in the future"

**Cause**: The date/time you specified is in the past or very close to now.

**Solution**: Use a future date and time. Dates must be at least a few minutes in the future.

### ❌ "Cannot edit a closed raid"

**Cause**: The raid has been closed or cancelled.

**Solution**: Only open raids can be edited. If you need to modify a closed raid, contact an admin.

### ❌ "Raid not found"

**Cause**: The raid ID you provided doesn't exist, or the raid belongs to a different server.

**Solution**: Check the raid ID. Run `/raid list` to see valid IDs, or look at the embed footer where the raid ID is shown.

### ⚠️ "Member not removed when they should be"

**Cause**: The member still has the raid role (maybe through a different role or role hierarchy).

**Solution**: Check that the member truly lost all raid roles. Verify with your guild's role setup.

**Note**: Role scanning looks for exact matches. If your raid is set for roles "Raider, Officer" and a member only has "Officer," they'll still be included.

### ⚠️ "Embed not updated in channel"

**Cause**: The bot couldn't find or update the original raid message, possibly because:
- The message was deleted
- The channel was deleted or archived
- Bot permissions have changed

**Solution**: The database was still updated successfully. You can use `/raid refresh` to send a new message if needed, or ask an admin to check channel permissions.

## Advanced: Understanding Roster Scanning

When you edit a raid, the bot compares:

1. **Current eligible members**: Users who currently have the raid roles
2. **Current roster members**: Users already in the raid

Then:

- **Members to add**: Those with the role but not in the current roster (new additions get "attending" status, but no class/spec)
- **Members to remove**: Those in the roster but without the role

### Important Notes

- New members added during an edit get "attending" status by default (they haven't responded yet)
- Their class/spec is fetched from the UserPreference database if available; otherwise they'll have "❓ No Class Set"
- Existing members who stay keep their current class/spec and status

## Best Practices

1. **Edit Before Announcing**: If editing the raid date/time significantly, edit before sending reminders or announcing changes.

2. **Verify Roles Are Correct**: Before editing to remove/add members, double-check your guild's role assignments.

3. **Check the Result**: After editing, verify the embed updated correctly and the roster looks right.

4. **Don't Edit Closed Raids**: Always close raids properly; don't edit them. Closed raids can't be changed for audit/accountability reasons.

5. **Use Timezone Settings**: Ensure your guild has the correct timezone configured so dates/times display correctly to users. Use `/config timezone` if needed.

## Related Commands

- **`/raid list`**: View all upcoming raids and their IDs
- **`/raid create`**: Create a new raid instead of editing an existing one
- **`/raid refresh`**: Manually refresh roster and update embed without changing date/time
- **`/raid close`**: Close a raid to prevent further changes
- **`/raid cancel`**: Cancel a raid and notify members
- **`/config raid-roles`**: Set up raid roles for your guild

## Support

If you encounter issues or have questions:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Run `/raid list` to verify the raid exists
3. Contact your server admin for permission issues
4. Check bot logs or error messages in the bot's DM

---

**Last Updated**: 2026-02-01  
**Related**: Raid Management System
