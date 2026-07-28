---
type: guide
title: RaidPresence Player Guide
created: 2026-02-18
tags:
  - players
  - user-guide
  - raids
related:
  - "[[RAID-COMMAND]]"
  - "[[CONFIG-COMMAND]]"
---

# RaidPresence Player Guide

User-friendly guide for raid members interacting with the RaidPresence Discord bot.

---

## What is RaidPresence?

RaidPresence is a Discord bot for World of Warcraft raids using a **reverse sign-up system**:

- **Everyone is automatically signed up** by default
- **Opt-out if you can't attend** (instead of opting-in)
- This ensures raid leaders know exactly who is available

---

## Getting Started

### 1. Check Your Class & Specialization

When you first use RaidPresence, set your class and specialization:

1. Click the **Select Menu** that appears in a raid message
2. Choose your World of Warcraft class
3. Choose your specialization (role)
4. Your choice is saved for the server

**Example:**
```
Class: Warrior
Specialization: Protection (Tank)
```

### 2. Attend a Raid

When a raid is posted, you're **automatically added to the roster** if you have the appropriate role.

Look for the raid message in Discord with:
- Raid name and time
- Role count (e.g., "2 Tanks, 5 Healers, 13 DPS")
- List of attendees sorted by role

---

## Responding to Raids

### Attending

Click **"I'm Attending"** button to confirm you'll be there.

- Your class color appears next to your name
- Status updates in real-time

### Can't Attend (Opt-Out)

Click **"I Can't Attend"** to opt-out.

**Optional:** A dialog will appear where you can provide a reason (up to 100 characters):
- "Busy that day"
- "Doctor's appointment"
- "In another raid"

Your reason is saved and raid leaders can view it in raid notes.

### Running Late

Click **"I'm Running Late"** if you'll join after raid start.

- Marked as "Late" in the roster
- Raid leader can count on you, just delayed

---

## Viewing Raid Information

### `/raid list` - Upcoming Raids

See all scheduled raids:

```
Raid 1: Karazhan Trash | Sunday 8:00 PM EST
  Status: GOOD (8/10 slots filled)
  Tanks: 2/2 | Healers: 3/4 | DPS: 3/4

Raid 2: World Bosses | Saturday 7:00 PM EST
  Status: LOW (2/10 slots filled)
  Tanks: 1/2 | Healers: 1/3 | DPS: 0/5
```

Click a raid to view full details and attend/opt-out.

### `/raid status` - Dashboard

Quick overview of **up to 7 upcoming raids**:

- Each raid shows fill percentage
- Color-coded status: 🟢 FULL | 🟡 GOOD | 🔴 LOW
- Role breakdown (Tanks/Healers/DPS)

**Perfect for:** Raid leaders planning staffing needs

### `/raid notes [raid_id]` - Notes & Opt-Out Reasons

View all notes for a specific raid:

- **Opt-Out Reasons:** Why people can't attend
- **Player Notes:** Any special comments

**Example:**
```
Opt-Out Reasons:
- John: "Doctor's appointment"
- Sarah: "Traveling that weekend"

Player Notes:
- Mike: "Need enchant for main hand"
```

---

## Attendance & Statistics

### `/raid attendance [player:] [period:]` - Your Statistics

Check your **reliability metrics**:

- **Reliability Score:** Percentage of raids attended
- **Response Time:** How quickly you respond
- **Role Flexibility:** Classes/specs you've played
- **Trend:** Are you improving/declining?

**Period Options:**
- `30` - Last 30 days
- `90` - Last 90 days  
- `all` - All-time statistics

**Example Output:**
```
Player: John (Warrior - Protection Tank)
Reliability: 92% (23/25 raids attended)
Response Time: Average 8 hours
Role Flexibility: Tank, Melee DPS
Trend: Stable (consistent attendance)
```

### `/raid stats` - Raid Statistics

View detailed statistics for any raid:

- **Attendance Rate:** % of signed-up players who attended
- **Class Distribution:** Which classes showed up
- **Top Attendees:** Most reliable players
- **Guild-Wide Stats:** Historical attendance across all raids

---

## Class Selection

### First Time Setup

When you first join raids, you'll see a **Select Menu**:

1. Choose your **Class** (Warrior, Mage, Priest, etc.)
2. Choose your **Specialization** (Tank, Heal, DPS)

**Supported Classes:**
- Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid, Monk, Demon Hunter, Death Knight

**Supported Specializations:**
- Tank, Healer, Melee DPS, Ranged DPS

### Update Your Class

To change your class/spec:

1. Find any raid message
2. Use the **Select Menu** at the top
3. Choose new class/spec
4. Your profile updates immediately

---

## DPS Display

The bot now separates DPS into Melee and Ranged for better raid composition visibility:

**Before:**
```
⚔️ DPS (8)
Player1, Player2, ...
```

**After:**
```
⚔️ Melee DPS (3)
Player1 (Rogue), Player2 (Warrior)

🏹 Ranged DPS (5)
Player3 (Mage), Player4 (Hunter), ...
```

This separation helps leaders understand class distribution and make informed decisions about recruitment and composition optimization.

**Emoji Meanings:**
- ⚔️ Melee DPS (physical damage dealers)
- 🏹 Ranged DPS (spellcasters and hunters)

---

---

## Important Changes in PR #15

### Per-Raid Roles (New)

**Previous:** Raid roles were set globally for the server via a `/config` subcommand (removed)

**Now:** Each raid specifies its own roles when created

**What this means for you:**
- Raid leaders now have more flexibility
- You might see different roles for different raids
- Always check the raid message to see which roles are needed

**Example:**
```
Current Composition: 2T / 2H / 3 ⚔️ Melee DPS / 3 🏹 Ranged DPS
Optimal for 10-man: 2T / 2-3H / 3-4 ⚔️ Melee DPS / 3-4 🏹 Ranged DPS

Analysis:
✓ Tank count is GOOD (2/2)
✗ Healer count is LOW (need 1 more)
✓ DPS is balanced (melee and ranged properly distributed)

Recommendation:
Ask Mike (Warrior Tank) to swap to Protection and join as Tank
Ask Sarah (Paladin Healer) to help as healer instead of DPS
```

### Archive System

Raids can now be **archived** for record-keeping:

**What Archived Raids Show:**
- Final attendance
- Which players showed up
- Final composition

**Search Archived Raids:**

```bash
/stats search "Karazhan" "30"
# Shows all Karazhan raids from last 30 days
```

**Result:** Raid leaders keep historical data organized

---

## Tips for Best Experience

### For Players

1. **Set your class early** - Do it the first time you see a raid
2. **Respond ASAP** - Raid leaders appreciate quick responses
3. **Be honest about attendance** - Let leaders know ASAP if plans change
4. **Check raid notes** - See what raid leaders have recorded
5. **Review your statistics** - Understand your reliability trends

### For Raid Leaders

See `/config` command reference for admin controls.

---

## Troubleshooting

### "Can't find raid to attend"

- Make sure you have the appropriate **class/role** configured
- Your Discord role might not match the raid roster settings
- Ask your raid leader to verify your permissions

### "Can't select my class"

- The Select Menu only appears on raid messages
- You need to be in the same Discord server
- Make sure RaidPresence bot has permissions

### "Don't see my attendance history"

- Use `/raid attendance player:[your-name] period:[30/90/all]`
- Must have attended at least one raid in the period
- Data is tracked per-server (separate for each Discord guild)

### "Missing a raid from my history"

- Raids older than 90 days may not be visible in dashboard
- Use `/raid attendance period:all` to see all-time stats

---

## Getting Help

**Questions about:**
- **Your statistics** → Use `/raid attendance`
- **Upcoming raids** → Use `/raid list` or `/raid status`
- **Raid composition** → Ask your raid leader (they use `/raid suggest`)
- **Technical issues** → Contact your server admin

**Contact Your Raid Leader:**
- They can help with permission issues
- They manage raid scheduling
- They decide which roles are needed

**Report Bugs:**
- https://github.com/anomalyco/RaidPresence/issues

---

## Language Support

RaidPresence supports:
- English 🇬🇧
- German 🇩🇪

Your server admin can set the language via `/config language`.

---

## Quick Reference

### Common Commands

| Command | Purpose |
|---------|---------|
| `/raid list` | See all upcoming raids |
| `/raid status` | Quick dashboard of raids |
| `/raid attendance` | Check your statistics |
| `/raid notes [raid]` | View raid notes |
| `/raid suggest [raid]` | Composition analysis (leaders) |

### Response Options

| Button | Meaning |
|--------|---------|
| I'm Attending | You'll be there |
| I Can't Attend | Opt-out (optional reason) |
| I'm Running Late | You'll join delayed |

### What Raid Leaders See

- Full attendance list
- When people responded
- Opt-out reasons
- Attendance statistics
- Composition analysis

---

## Related Documentation

- **Setup Guide** → [[SETUP-GUIDE]]
- **Full Raid Command Reference** → [[RAID-COMMAND]]
- **Configuration Reference** → [[CONFIG-COMMAND]]
- **Database Guide** → [[DATABASE-MIGRATION-GUIDE]]

---

**Last Updated:** 2026-02-18
**RaidPresence Version:** 0.1.0+
