---
type: guide
title: RaidPresence Player Guide
created: 2026-02-04
tags:
  - players
  - guide
  - interactions
related:
  - "[[RAID-COMMAND]]"
  - "[[CONFIG-COMMAND]]"
---

# RaidPresence Player Guide

Guide for players on how to interact with RaidPresence raids and manage attendance.

## Table of Contents

1. [Overview](#overview)
2. [Understanding Raid Messages](#understanding-raid-messages)
3. [Managing Attendance](#managing-attendance)
4. [Setting Class & Specialization](#setting-class--specialization)
5. [Raid Embed Display](#raid-embed-display)
6. [Tips & Tricks](#tips--tricks)
7. [FAQ](#faq)

---

## Overview

RaidPresence is a Discord bot that automatically manages raid rosters for World of Warcraft guilds. Instead of signing up individually, everyone with a raid role is automatically added and can opt out if they can't attend.

### Key Concepts

- **Reverse Sign-Up**: You're automatically in raids - opt out if you can't attend
- **Class Tracking**: Set your WoW class and specialization for the raid
- **Real-Time Updates**: Changes happen instantly
- **Interactive Buttons**: One-click management of your attendance status

---

## Understanding Raid Messages

When a raid leader creates a raid, you'll see a message in Discord that looks like this:

```
┌─────────────────────────────────────────┐
│ 🗓️  Heroic EN Raid                      │
│ 📅 Wednesday, January 15 @ 20:00 UTC    │
│ 👥 Tanks: 2 • Healers: 4 • DPS: 14 (20) │
│                                         │
│ 🛡️  TANKS (2/2)                        │
│ ⚔️ Player1 (Arms Warrior)               │
│ 🛡️ Player2 (Protection Paladin)        │
│                                         │
│ 💚 HEALERS (4/4)                        │
│ ☀️ Player3 (Holy Priest)                │
│ ☀️ Player4 (Holy Priest)                │
│ 🌙 Player5 (Restoration Shaman)         │
│ 🌳 Player6 (Restoration Druid)          │
│                                         │
│ ⚔️  DPS (14/20)                        │
│ 🗡️ Player7 (Fire Mage)                │
│ ... (more players listed)               │
│                                         │
│ ⏰ RUNNING LATE (1)                     │
│ 🏃 Player99                             │
│                                         │
│ ❌ OPTED OUT (2)                        │
│ 🚫 Player98                             │
│ 🚫 Player97                             │
│                                         │
│ [Opt Out] [Opt In] [Late] [Set Class] │
└─────────────────────────────────────────┘
```

### Reading the Embed

- **Title**: Raid name (e.g., "Heroic EN Raid")
- **Date & Time**: When the raid happens (shows in your local timezone)
- **Role Summary**: How many tanks, healers, and DPS
- **Main Columns**: Your role section with player names and specs
- **Special Sections**: Late attendees and opted-out players
- **Buttons**: For managing your status

---

## Managing Attendance

### The Four Buttons

Every raid message has four interactive buttons:

#### 1. **Opt Out** 🚫

Removes you from the raid if you can't attend.

**When to use**: You're not available for the raid

**What happens**:
- You're moved to "❌ OPTED OUT" section
- Raid leader can see who can't make it
- You can opt back in later with "Opt In" button
- Buttons remain clickable (can change your mind anytime before raid closes)

#### 2. **Opt In** ✅

Adds you back to the raid if you previously opted out.

**When to use**: You changed your mind and can attend

**What happens**:
- You're moved back to your role section (Tank/Healer/DPS)
- If you set a class, you go to correct role based on your spec
- Raid roster updates immediately

#### 3. **Running Late** ⏰

Marks you as running late while staying on the raid roster.

**When to use**: You're attending but will be 5-15 minutes late

**What happens**:
- You're moved to "⏰ RUNNING LATE" section
- You still count toward raid composition
- Raid leader knows who's delayed
- Can click again to remove the late status

#### 4. **Set Class/Spec** 🎮

Configure your World of Warcraft class and specialization.

**When to use**: First time joining raids, or changing specs

**What happens**:
- Opens a dropdown to select your WoW class
- Opens second dropdown to select your specialization
- Saves your preference for future raids
- Updates raid embed immediately with correct role and spec symbol

---

## Setting Class & Specialization

### Step-by-Step: Your First Raid

1. **Click "Set Class/Spec" button**
   - Dialog opens in Discord

2. **Select Your Class**
   - Choose from: Warrior, Paladin, Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid, Demon Hunter, Evoker, Death Knight, Monk

3. **Select Your Specialization**
   - Based on class, choose your active spec:
     - Warrior: Arms, Fury, Protection
     - Paladin: Holy, Protection, Retribution
     - Priest: Discipline, Holy, Shadow
     - Druid: Balance, Feral, Guardian, Restoration
     - (etc. - one spec per class)

4. **Confirmation**
   - Your selection is saved immediately
   - Raid embed updates with:
     - Your spec symbol (e.g., ⚔️ for Arms Warrior)
     - Your name moves to correct role column (Tank/Healer/DPS)
     - Your class/spec displays next to name

5. **Future Raids**
   - Your class/spec preference is remembered
   - You'll automatically appear in correct role category
   - Can change anytime with "Set Class/Spec" button

### Changing Your Spec Later

If you switch specializations between raids:

1. Click **"Set Class/Spec"** button again
2. Select your new specialization
3. Raid embed updates immediately
4. You move to the correct role column based on new spec

### Available Specs by Class

| Class | Specializations |
|-------|-----------------|
| **Warrior** | Arms, Fury, Protection |
| **Paladin** | Holy, Protection, Retribution |
| **Hunter** | Beast Mastery, Marksmanship, Survival |
| **Rogue** | Assassination, Outlaw, Subtlety |
| **Priest** | Discipline, Holy, Shadow |
| **Shaman** | Elemental, Enhancement, Restoration |
| **Mage** | Arcane, Fire, Frost |
| **Warlock** | Affliction, Demonology, Destruction |
| **Monk** | Brewmaster, Mistweaver, Windwalker |
| **Druid** | Balance, Feral, Guardian, Restoration |
| **Demon Hunter** | Havoc, Vengeance |
| **Death Knight** | Blood, Frost, Unholy |
| **Evoker** | Augmentation, Devastation, Preservation |

---

## Raid Embed Display

### Column Organization

The raid uses a **3-column layout** organized by role:

#### 🛡️ **TANKS** (Left Column)

- Shows tank specializations: Protection Warrior, Protection Paladin, Blood Death Knight, Brewmaster Monk, Guardian Druid, Vengeance Demon Hunter
- Shows count (e.g., "2/2")
- Lists tank players with their spec symbols

#### 💚 **HEALERS** (Middle Column)

- Shows healer specializations: Holy Priest, Discipline Priest, Restoration Shaman, Restoration Druid, Mistweaver Monk, Holy Paladin, Preservation Evoker
- Shows count (e.g., "4/5")
- Lists healer players with their spec symbols

#### ⚔️ **DPS** (Right Column)

- Combines all DPS roles (Melee & Ranged)
- Shows count (e.g., "14/20")
- Lists DPS players with their spec symbols

### Special Sections (Below Columns)

#### ⏰ **RUNNING LATE**

- Players who marked themselves as running late
- They still count toward composition
- Shows name and count
- Example: "⏰ RUNNING LATE (1): Player99"

#### ❌ **OPTED OUT**

- Players who can't attend
- Don't count toward raid composition
- Shows name and count
- Example: "❌ OPTED OUT (2): Player98, Player97"

#### ❓ **NO CLASS**

- Players who haven't set class/spec yet
- Usually appear in a default section
- Use "Set Class/Spec" to move to correct role

### Spec Symbols

Each specialization has a symbol that appears next to player names:

**Tank Symbols:**
- 🛡️ Protection Warrior
- 🛡️ Protection Paladin
- 🧊 Blood Death Knight
- 🍺 Brewmaster Monk
- 🌳 Guardian Druid
- 🔴 Vengeance Demon Hunter

**Healer Symbols:**
- ☀️ Holy Priest
- 🕯️ Discipline Priest
- 🌙 Restoration Shaman
- 🌿 Restoration Druid
- ☕ Mistweaver Monk
- 💛 Holy Paladin
- ✨ Preservation Evoker

**DPS Symbols (Melee):**
- ⚔️ Arms Warrior
- 🗡️ Fury Warrior
- ⚔️ Retribution Paladin
- 🔪 Assassination Rogue
- 🏹 Outlaw Rogue
- 🗡️ Subtlety Rogue
- 🧠 Feral Druid
- ⛓️ Frost Death Knight
- ☠️ Unholy Death Knight
- 👊 Windwalker Monk
- 🔥 Havoc Demon Hunter

**DPS Symbols (Ranged):**
- 🏹 Beast Mastery Hunter
- 🏹 Marksmanship Hunter
- 🗡️ Survival Hunter
- 🔵 Arcane Mage
- 🔥 Fire Mage
- ❄️ Frost Mage
- 💜 Affliction Warlock
- 👿 Demonology Warlock
- 🔥 Destruction Warlock
- ⚡ Elemental Shaman
- ⚔️ Enhancement Shaman
- 🌊 Augmentation Evoker
- 💥 Devastation Evoker
- 📚 Balance Druid

---

## Tips & Tricks

### Make Timely Decisions

- **Opt out early** if you know you can't attend - helps raid leader plan
- **Don't wait until raid time** to decide - let leadership know asap
- **Click buttons immediately** if status changes

### Update Your Class/Spec

- **First raid?** Click "Set Class/Spec" right away
- **Swapping specs?** Update immediately so leadership knows composition
- **Trying different roles?** Update button keeps your preference saved

### Check Before You Leave

Before logging off:
1. Look at the raid embed
2. Verify your name is in correct role section
3. Check your spec symbol matches your actual spec in-game

### Timezone Awareness

- Raid times show in **your local Discord timezone**
- But make sure you know what timezone your **guild uses**
- Check with raid leader if you're unsure about raid time

### Late Notices

If you're running late:
1. **Click "Running Late" button ASAP** - don't wait to notify
2. Gives raid leader time to adjust composition
3. Better than sudden absence with no warning

---

## FAQ

### Q: I was automatically added to a raid I don't want to attend. What do I do?

**A:** Click the **"Opt Out"** button. You'll be moved to the "OPTED OUT" section. The raid leader will see that you're not available.

### Q: Can I join a raid I opted out of?

**A:** Yes! Click the **"Opt In"** button anytime before the raid leader closes the raid.

### Q: What if I set the wrong class/spec?

**A:** Click **"Set Class/Spec"** again and choose the correct specialization. The embed updates immediately.

### Q: Will my class/spec be remembered for next raid?

**A:** Yes! Your class/spec is saved in your player profile. You'll automatically appear in the correct role for future raids. You can change it anytime.

### Q: What's the difference between "Opted Out" and "Running Late"?

**A:** 
- **Opted Out**: You can't attend the raid at all
- **Running Late**: You're attending but will be 5-15 minutes behind the start time

### Q: Can I have different specs for different raids?

**A:** Not directly - you have one saved spec at a time. But you can click **"Set Class/Spec"** before each raid to change it if you're swapping specs.

### Q: Do I need to do anything to confirm attendance?

**A:** No! Just don't opt out. Being in the raid means you're confirmed to attend. You're automatically added unless you click "Opt Out."

### Q: What if I'm unsure about the raid time in my timezone?

**A:** Discord shows times in your local timezone automatically. But to be safe:
1. Look at the date/time on the raid embed
2. Cross-reference with your local time
3. Ask in Discord or your guild if unsure

### Q: Can the raid leader remove me from the raid?

**A:** The raid leader can use `/raid refresh` to update the roster based on Discord roles. If you no longer have the required raid role in Discord, you'll be removed.

### Q: What happens if the raid gets cancelled?

**A:** The raid message will show a cancellation notice. You don't need to do anything - you'll be notified in Discord.

### Q: Will I be automatically removed if I lose my raid role in Discord?

**A:** Not immediately. But if the raid leader uses `/raid refresh`, the roster will update and you'll be removed if you no longer have the required role.

### Q: Can I sign up for a raid I don't have the raid role for?

**A:** No. You must have the Discord role assigned by a server admin. Contact your guild leadership to get the raid role if you should have it.

### Q: What if I don't set my class/spec?

**A:** You'll appear in the "❓ NO CLASS" section. You won't be placed in a specific role category (Tank/Healer/DPS) until you set it.

### Q: Do I need to set my class/spec every raid?

**A:** No! It's saved from your first time. You'll automatically appear in the correct role for future raids using the same spec.

### Q: Can I have a different spec than I use in-game?

**A:** You could, but you shouldn't! Set the spec you're actually using so the raid leader knows the correct composition.

### Q: What if there's an issue with the buttons?

**A:** Try these steps:
1. Refresh Discord (Ctrl+R or Cmd+R)
2. Close and reopen Discord
3. If buttons still don't work, ask your raid leader

---

## Related Documentation

- [[RAID-COMMAND]] - Technical details about raid commands
- [[CONFIG-COMMAND]] - How raid leaders configure the bot
- [[SETUP-GUIDE]] - Server setup information
