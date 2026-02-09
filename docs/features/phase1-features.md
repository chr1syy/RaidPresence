---
type: reference
title: Phase 1 Features - Quick Wins
created: 2026-02-09
tags:
  - phase-1
  - raid-management
  - analytics
  - user-guide
related:
  - "[[Raid-Management]]"
  - "[[Raid-Creation]]"
  - "[[raid-edit]]"
---

# Phase 1 Features

Phase 1 introduces four new features that enhance raid management: **Raid Clone**, **Attendance Stats**, **Custom Reminders**, and **Status Dashboard**.

## `/raid clone` - Clone Previous Raid

Quickly create a new raid by cloning an existing one. The clone copies the raid configuration, roles, and automatically adds all eligible members with fresh attendance status.

### Command Syntax

```
/raid clone raid_id:[id] date:[YYYY-MM-DD] [time:[HH:MM]] [title:[name]]
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `raid_id` | String | Yes | The ID of the raid to clone (shown in raid embed footer) |
| `date` | String | Yes | New raid date in YYYY-MM-DD format |
| `time` | String | No | New raid time in HH:MM 24-hour format (defaults to source raid time) |
| `title` | String | No | New raid title (defaults to original title) |

### Examples

**Clone with new date only:**
```
/raid clone raid_id:abc123 date:2026-03-15
```
Creates a new raid on March 15 with the same time, title, and roles as the original.

**Clone with new date, time, and title:**
```
/raid clone raid_id:abc123 date:2026-03-15 time:20:00 title:Heroic Raid - Week 12
```

### What Gets Cloned

- Raid title (unless overridden)
- Raid time (unless overridden)
- Raid roles (same Discord roles scanned)
- Raid description

### What Does NOT Get Cloned

- Attendance status (all members start as "attending")
- Opted-out / running late states (reset for new raid)
- The original raid's embed message

### Permission Requirements

You must have the raid leader role configured for your server.

### FAQ

**Q: Can I clone a closed or cancelled raid?**
A: Yes. The clone creates an independent new raid regardless of the source raid's status.

**Q: Are members who left the guild still added?**
A: No. The clone rescans eligible members based on current Discord role assignments.

**Q: Does cloning affect the original raid?**
A: No. The new raid is fully independent.

---

## `/raid stats` - Attendance Statistics

View attendance statistics for a single raid or your entire guild over a time period.

### Command Syntax

```
/raid stats [raid_id:[id]] [period:[week|month|all]]
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `raid_id` | String | No | Specific raid ID for single-raid stats |
| `period` | Choice | No | Time period: `week` (7 days), `month` (30 days), `all` (all time) |

If `raid_id` is provided, shows stats for that specific raid. Otherwise shows guild-wide stats for the selected period (defaults to all time).

### Single Raid Stats

Shows for a specific raid:
- **Attendance Rate** - Percentage of members attending
- **Reliability Score** - Highly Reliable (95%+), Reliable (80-94%), or Inconsistent (<80%)
- **Breakdown** - Attending, opted out, and running late counts
- **Role Composition** - Tank, healer, melee DPS, and ranged DPS counts
- **Class Distribution** - Most played classes with frequencies

### Guild-Wide Stats

Shows across all raids in the selected period:
- **Total Raids** - Number of raids in the period
- **Average Attendance Rate** - Mean attendance across all raids
- **Total Unique Raiders** - Distinct players who participated
- **Top 10 Attendees** - Most reliable players with attendance rates
- **Class Distribution** - Most played classes across all raids

### Examples

**View stats for a specific raid:**
```
/raid stats raid_id:abc123
```

**View guild stats for the last 30 days:**
```
/raid stats period:month
```

**View all-time guild stats:**
```
/raid stats period:all
```

### FAQ

**Q: What counts as "attending"?**
A: Members with status "attending" or "late" are counted as attending for statistics purposes.

**Q: How is the reliability score calculated?**
A: Based on attendance rate: 95%+ = Highly Reliable, 80-94% = Reliable, below 80% = Inconsistent.

**Q: Are cancelled raids included in guild stats?**
A: Only open raids are included in guild-wide statistics.

---

## `/raid remind` - Custom Reminder Messages

Send a reminder to your raid channel with an optional custom message from the raid leader. The reminder also shows which players have opted out.

### Command Syntax

```
/raid remind raid_id:[id] [message:[text]]
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `raid_id` | String | Yes | The ID of the raid to send a reminder for |
| `message` | String | No | Custom message to include (max 1024 characters) |

### Examples

**Send a basic reminder:**
```
/raid remind raid_id:abc123
```

**Send a reminder with a custom message:**
```
/raid remind raid_id:abc123 message:Bring flasks and food! We're pushing heroic tonight.
```

### What the Reminder Shows

- Raid title and start time (with relative countdown)
- Custom message from the raid leader (if provided)
- List of opted-out players (so the leader knows who's missing)
- Mentions configured raid roles to notify members

### Permission Requirements

You must have the raid leader role configured for your server.

### FAQ

**Q: Does the reminder ping everyone?**
A: It mentions the Discord roles configured for the raid. If no roles are configured, it uses @everyone.

**Q: Is the custom message length limited?**
A: Yes, custom messages are limited to 1024 characters (Discord embed field limit). Longer messages are truncated.

**Q: Can I send multiple reminders?**
A: Yes. There's no limit on how many reminders you can send for a raid.

---

## `/raid status` - Status Dashboard

View all upcoming raids at a glance with roster status indicators.

### Command Syntax

```
/raid status
```

No parameters required. Shows up to 7 upcoming open raids for your server.

### What the Dashboard Shows

For each upcoming raid:
- **Raid title** and scheduled time (with relative countdown)
- **Roster fill** - X/Y members with percentage
- **Status indicator**:
  - **FULL** - 80%+ of roster attending
  - **GOOD** - 50-79% attending
  - **LOW** - Below 50% attending
- **Role breakdown** - Tank, healer, and DPS counts

### Example Output

```
1. Mythic Raid - Week 10
   Saturday at 8:00 PM (in 2 days)
   Roster: 18/20 (90%) — FULL
   Tanks: 2 | Healers: 4 | DPS: 12

2. Alt Run - Heroic
   Sunday at 7:00 PM (in 3 days)
   Roster: 8/15 (53%) — GOOD
   Tanks: 1 | Healers: 2 | DPS: 5
```

### Color Coding

The embed color reflects the overall roster health:
- **Green** - All raids at 80%+ attendance
- **Yellow** - Some raids between 50-79%
- **Red** - Any raid below 50% attendance

### FAQ

**Q: How many raids does it show?**
A: Up to 7 upcoming open raids, sorted by date (earliest first).

**Q: Does it show closed or cancelled raids?**
A: No. Only open raids are displayed.

**Q: Can any member use this command?**
A: Yes. The status dashboard is read-only and available to all server members.

---

## Related Commands

- **`/raid create`** - Create a new raid
- **`/raid edit`** - Edit an existing raid
- **`/raid list`** - List all upcoming raids
- **`/raid close`** - Lock a raid roster
- **`/raid cancel`** - Cancel a raid
- **`/raid refresh`** - Refresh raid roster and embed
- **`/config raid-roles`** - Configure raid roles
- **`/config leader-roles`** - Configure leader roles
- **`/config timezone`** - Set server timezone

---

**Last Updated**: 2026-02-09
