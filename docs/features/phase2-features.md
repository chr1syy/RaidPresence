# Phase 2 Features - User & Admin Guide

This guide covers the advanced engagement features added in Phase 2: attendance tracking, composition analysis, raid notes, and the archive system.

## Features Overview

### 1. Player Attendance History & Trends

Track your guild members' reliability and attendance patterns over time.

#### View Player Attendance

```
/raid attendance player:@Thrall period:month
```

**Parameters:**
- `player` (required) - The player to check
- `period` (optional) - Time period to analyze
  - `month` - Last 30 days (default)
  - `quarter` - Last 90 days
  - `all` - All time

**What You See:**

- **Raids Invited** - Total raids the player was invited to
- **Raids Attended** - How many they actually attended
- **Attendance %** - Calculated percentage
- **Reliability Score** - Color-coded rating
  - 🟢 **Highly Reliable** (90-100%) - Rock-solid player
  - 🟡 **Reliable** (60-89%) - Generally dependable
  - 🔴 **Inconsistent** (<60%) - Frequently missing
- **Trend** - Is attendance improving (↗️), stable (→), or declining (↘️)?
- **Main Role & Alt Roles** - What do they usually play?
- **Response Time** - How quickly do they respond to invites?
- **Last 5 Raids** - Recent attendance history

**Example Use Case:**

Guild Leader: "I'm wondering if Thrall is reliable. Let me check..."
```
/raid attendance player:@Thrall
→ Shows 95% attendance over last 30 days with ↗️ trend
→ Guild Leader decides Thrall is promotion-worthy
```

---

### 2. Class/Spec Recommendations & Composition Analysis

Get instant feedback on your raid composition and suggestions for improvement.

#### Analyze Raid Composition

```
/raid suggest raid_id:raid-123
```

**Parameters:**
- `raid_id` (required) - The raid to analyze

**What You See:**

- **Current Roster** - Breakdown by role
  - 🛡️ Tanks (current/optimal)
  - 💚 Healers (current/optimal)
  - ⚔️ DPS (current/optimal)

- **Status** - At a glance, your raid status
  - ✅ **READY** - Optimal composition achieved
  - ⚠️ **NEEDS 1 HEALER** - Short-staffed
  - ⚠️ **OVERSTOCKED DPS** - Too many in a role

- **Recommendations** - Specific player suggestions
  - Shows top candidates to fill gaps
  - Lists their main role, alt specs, and flexibility
  - Example: "Uther (Paladin) - Main: Holy, Alt: Protection (80% flexible)"

- **Available Players** - Who can help?
  - Lists opted-out or not-yet-responded players
  - Shows their class/specs

- **Success Likelihood** - Estimated raid success
  - 75% - Based on composition balance, healer ratio, tank coverage, and player flexibility

**Example Use Case:**

Raid Leader: "We're 3 people short, all DPS. Let me see who to ask..."
```
/raid suggest raid_id:raid-123
→ Shows: Need 3 DPS, 2 Healers
→ Top suggestions: Jaina (Mage DPS + off-heal), Arthas (Warrior DPS + tank)
→ Success likelihood: 68%
→ Raid Leader invites them and recheck composition
```

---

### 3. Optional Raid Notes & Opt-Out Comments

Allow players to explain their opt-outs and add status comments.

#### Opt Out with Reason

When a player clicks the **❌ Opt Out** button on a raid invite:

1. Modal appears: "Why are you opting out? (optional, max 100 chars)"
2. Player types reason (or leaves blank)
3. Reason is stored and displayed in raid embed

**In Raid Embed:**

Before:
```
❌ Opted Out (2)
- Jaina
- Arthas
```

After:
```
❌ Opted Out (2)
- Jaina (IRL commitments)
- Arthas (Will be late, can join halfway)
```

#### View All Raid Notes

```
/raid notes raid_id:raid-123
```

**Shows:**

- **Opt-Out Reasons** - Why players aren't coming
- **Player Comments** - Any notes they added
- Organized by player name

**Example Use Case:**

Raid Leader: "Several people opted out. Let me see why..."
```
/raid notes raid_id:raid-123
→ Shows:
  - Jaina: "IRL commitments"
  - Arthas: "Will be late, can join halfway"
  - Muradin: "Raid is fine, just can't make it tonight"
→ Raid Leader sees a pattern: many have personal reasons
→ Decides to reschedule after-hours raid
```

---

### 4. Raid Pinning & Archive System

Keep raid history organized with a searchable archive.

#### Archive a Raid (Pin)

```
/raid pin raid_id:raid-123
```

**What Happens:**

1. Original raid embed is removed from raid channel
2. Copy is moved to archive channel (configured by guild)
3. Raid is marked as "archived" in database
4. Can still be searched and restored

#### Restore a Raid (Unpin)

```
/raid unpin raid_id:raid-123
```

**What Happens:**

1. Archived raid is restored to original channel
2. Copy removed from archive
3. Raid is marked as "active" again

#### Search Archived Raids

```
/raid search query:boss period:month
/raid search query:Thrall period:90
/raid search period:all
```

**Parameters:**
- `query` (optional) - Search by raid name or player name
- `period` (optional) - Filter by time range
  - `7` - Last 7 days
  - `30` - Last 30 days (default)
  - `90` - Last 90 days
  - `all` - All time

**Results Show:**

- Raid date
- Raid name
- Attendance % (who showed up)
- Key participants (first 5 players)
- Raid ID (copy for `/raid unpin`)

**Example Use Case:**

Raid Leader: "How did that TK raid go 2 months ago?"
```
/raid search query:TK period:90
→ Shows results from 2 months ago
→ Can see attendance, participants, etc.
→ Can restore it with /raid unpin if needed
```

---

## Guild Admin Configuration

### Set Archive Channel

```
/config archive-channel channel:#raid-archive
```

Designates where archived raids will be stored.

**Requirements:**
- Must be a text channel
- Bot must have permission to post messages
- Only admins can configure

### Enable Auto-Archive

```
/config auto-archive enabled:true
```

Automatically archive raids when they close.

**Options:**
- `true` - Auto-archive is ON
- `false` - Auto-archive is OFF (default)

**Prerequisites:**
- Archive channel must be configured first
- Only admins can enable

**Behavior:**
- Runs automatically every 2 minutes (when raid scheduler checks for closed raids)
- Only archives if guild has this enabled
- Graceful error handling (doesn't break raid closure if archive fails)

**Example Use Case:**

Guild Admin: "We have 200+ raids archived. Let's clean up the main channel..."
```
/config archive-channel channel:#raid-archive
/config auto-archive enabled:true
→ From now on, raids automatically archive when they close
→ Main raid channel stays clean
→ Admins can still search archives anytime
```

---

## Best Practices

### Attendance Tracking

1. **Check player reliability before promotion** - Use `/raid attendance` to verify commitment
2. **Identify problem players early** - Red reliability score + declining trend
3. **Reward consistency** - Highly Reliable players earn roster spots
4. **Help struggling players** - If declining, offer coaching or 1-on-1s

### Composition Planning

1. **Run suggestions before finalizing roster** - Use `/raid suggest` before invites go out
2. **Watch the success likelihood** - If <60%, consider rescheduling or inviting more
3. **Identify flexible players** - These are valuable for filling gaps
4. **Track role distribution** - Aim for 2T:3H:10D ratio (10-man example)

### Raid Notes

1. **Encourage transparency** - Let players explain their opt-outs
2. **Identify patterns** - If many opt-out for same reason, reschedule
3. **Be understanding** - IRL comes first, always

### Archive System

1. **Configure archive channel immediately** - One-time setup, helps forever
2. **Use search before rescheduling** - Check if raid was done before
3. **Reference past performance** - "Last time this raid was 80% attendance"
4. **Clean up main channel** - Auto-archive keeps things tidy

---

## Troubleshooting

### Attendance Command Shows "Player Not Found"

**Problem:** You're trying to check attendance for someone who hasn't participated in raids.

**Solution:** Player must have at least one raid attendance record. Have them join a raid first.

### Composition Analysis Shows Wrong Numbers

**Problem:** Current roster count doesn't match what you see on-screen.

**Solution:** Roster is calculated based on current attendance (not responded = not counted). Remind people to respond!

### Archive Channel Not Working

**Problem:** You configured archive channel but `/raid pin` says "Archive not configured"

**Solution:** 
1. Check `/config view` to verify channel is set
2. Make sure bot has permissions to post in that channel
3. Try re-running `/config archive-channel` with the correct channel

### Auto-Archive Not Working

**Problem:** Raids close but don't automatically archive.

**Solution:**
1. Check that `/config auto-archive enabled:true` is set
2. Check that `/config archive-channel` is configured first (prerequisite!)
3. Auto-archive only runs when raid scheduler checks (every 2 minutes)
4. Wait 2-3 minutes, then check if raid moved to archive

---

## Permission Requirements

| Feature | Permission Needed |
|---------|-------------------|
| `/raid attendance` | Guild member |
| `/raid suggest` | Guild member |
| `/raid notes` | Guild member |
| `/raid search` | Guild member |
| `/raid pin` | Manage Raids (configured role) |
| `/raid unpin` | Manage Raids (configured role) |
| `/config archive-channel` | Administrator |
| `/config auto-archive` | Administrator |

---

## Advanced Topics

### Reliability Score Algorithm

```
if attendance_rate >= 90%: Highly Reliable 🟢
elif attendance_rate >= 60%: Reliable 🟡
else: Inconsistent 🔴
```

### Trend Detection

Attendance rate is calculated weekly over 90 days:

```
Improving (↗️): Recent weeks higher than older weeks
Stable (→): Consistent week-to-week
Declining (↘️): Recent weeks lower than older weeks
```

Confidence score indicates how reliable the trend is (based on data volume).

### Composition Success Likelihood

Estimated as weighted sum:

```
Success % = (composition_balance * 40%) 
          + (healer_ratio * 30%)
          + (tank_coverage * 20%)
          + (flexibility_score * 10%)
```

Lower score means more risk. Use it as planning tool, not absolute truth.

---

## Examples in Action

### Example 1: Planning a Mythic Raid

```
Guild Leader: "Let's plan Mythic+ raids!"

Step 1: Create raid
/raid create name:Mythic+ difficulty:M+ date:2026-02-20 start_time:18:00

Step 2: Check composition
/raid suggest raid_id:mythic-2-20
→ Shows: Need 1 more healer, 2 more DPS
→ Success likelihood: 62% (risky)

Step 3: Check who to invite
→ Top suggestion: Jaina (Mage, DPS + off-heal)
/raid attendance player:@Jaina period:month
→ Shows: 85% attendance, Reliable 🟡, ↗️ improving

Step 4: Finalize
/raid invite players:Jaina,Arthas,Uther
→ Wait for responses

Step 5: Before raid starts
/raid suggest raid_id:mythic-2-20
→ Now shows: 94% success likelihood ✅
→ Ready to go!
```

### Example 2: Analyzing Attendance Problems

```
Guild Leader: "Thrall keeps missing raids. Is he reliable?"

/raid attendance player:@Thrall period:quarter
→ Shows: 45% attendance last 90 days
→ Reliability: Inconsistent 🔴
→ Trend: Declining ↘️
→ Last 5 raids: 4 missed, 1 attended

Guild Leader: (Approaches Thrall in Discord)
→ "I see you've had a rough few weeks. Everything okay?"
→ "Yeah, work has been crazy. Should settle down next month."
→ "Got it. Let's revisit in 30 days. Good luck!"

30 days later:
/raid attendance player:@Thrall period:month
→ Shows: 90% attendance last 30 days
→ Reliability: Highly Reliable 🟢
→ Trend: Improving ↗️
→ Ready for return!
```

### Example 3: Organizing Archive

```
Guild Admin: "We have 300 raids across 2 months. It's a mess!"

Step 1: Configure
/config archive-channel channel:#raid-history
/config auto-archive enabled:true
→ From now on, old raids auto-move

Step 2: Search old raids
/raid search period:all
→ Shows all 300 raids in archive

Step 3: Reference raid
Raid Leader: "How'd Throne do last month?"
/raid search query:Throne period:90
→ Shows that raid with 92% attendance
→ Decides to do it again next week

Step 4: Main channel stays clean
Only active raids in #raids-signups
History safely stored in #raid-history
```

---

## FAQ

**Q: Can players opt out without giving a reason?**
A: Yes! Reason is optional. They can just hit "❌ Opt Out" without typing anything.

**Q: How far back does attendance tracking go?**
A: It can track "all time" (since your guild created first raid), or limited to last 30/90 days. Default is 30 days.

**Q: Can I restore an archived raid back to the main channel?**
A: Yes! Use `/raid unpin raid_id:xxx` to restore it.

**Q: Will auto-archive break active raids?**
A: No. Auto-archive only triggers when raids close (time expires). Active raids are never archived automatically.

**Q: What if I delete the archive channel?**
A: Archived raids are stored in database too, but `/raid search` will fail. Reconfigure archive channel and raids will be searchable again.

**Q: Can I see who's flexible for multiple roles?**
A: Yes! Both `/raid suggest` and `/raid attendance` show alt roles and flexibility scores.

---

## Contact & Support

Have questions? Found a bug?

- **Discord Community**: [Join our server](https://discord.com/invite/TxXfbY52fy)
- **Report Issue**: [GitHub Issues](https://github.com/chr1syy/RaidPresence/issues)
- **Email Support**: Check GitHub repo for contact

