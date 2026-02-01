---
type: reference
title: 'Raid Edit - Enhancement Roadmap'
created: 2026-02-01
tags:
  - roadmap
  - future-features
  - enhancements
related:
  - "[[handleEditRaid]]"
  - "[[ROADMAP]]"
---

# Raid Edit - Enhancement Roadmap

Future enhancements and improvements for the `/raid edit` feature, prioritized by impact and effort.

## Priority Framework

| Priority | Impact | Effort | Frequency | User Value |
|----------|--------|--------|-----------|-----------|
| 🔴 **High** | 9-10 | 1-3 | Daily | Critical feature gap |
| 🟡 **Medium** | 6-8 | 3-5 | Weekly | Improved workflow |
| 🟢 **Low** | 3-5 | 5-10 | Monthly | Nice-to-have |

---

## High Priority Features

### 1. 🔴 Allow Editing Raid Roles (with Auto-Rescan)

**Status**: Planned  
**Difficulty**: Medium (3-4 hours)  
**Impact**: High - Frequently requested

#### Current Limitation

Raid roles are immutable. If guild adds a new role or changes role names, raid leaders must delete and recreate the entire raid.

#### Proposed Solution

Add optional `roles` parameter to edit command:

```
/raid edit raid_id:[id] [roles:"Role1,Role2,Role3"]
```

**Changes Needed**:

1. **Update Schema** (Prisma):
   - Add `rolesUpdatedAt` timestamp field (for audit trail)
   - Schema already supports role updates

2. **Update Validation**:
   - Validate new roles exist in guild
   - Ensure at least one valid role provided
   - Warn if no one has new roles (roster would be empty)

3. **Update Member Scanning**:
   ```typescript
   // Use new roles instead of old ones
   const roleIds = newRoles.split(',').map(r => r.trim());
   // Scan entire guild against new roles
   // Add new members, remove now-ineligible
   ```

4. **Database Update**:
   ```typescript
   await prisma.raid.update({
     where: { id: raidId },
     data: {
       roles: newRoles,
       rolesUpdatedAt: new Date(),
     }
   });
   ```

5. **Logging**:
   ```typescript
   // Track: old roles → new roles for audit
   console.log(`Raid ${raidId}: roles changed from "${raid.roles}" to "${newRoles}"`);
   ```

**Edge Cases**:
- User provides same roles (no-op)
- New roles result in empty roster (warn, but allow)
- Old roles and new roles overlap (gradual transition)

**Testing**:
- Change roles with member overlap
- Change roles with no overlap (full replacement)
- Cancel role change mid-operation

**User Communication**:
```
✅ Raid roles updated!

**Old Roles**: Raider, Officer
**New Roles**: DungeonGroup, TrialRaiders

**Roster Changes**:
• Added 3 new member(s) with DungeonGroup role
• Removed 1 member(s) no longer eligible
```

**Release Notes**:
"You can now edit raid roles without recreating the entire raid. Run `/raid edit` with the `roles` parameter to update who's invited."

---

### 2. 🔴 Bulk Edit Multiple Raids at Once

**Status**: Planned  
**Difficulty**: High (5-7 hours)  
**Impact**: High - Saves time for raid series

#### Current Limitation

Editing 5 raids to shift them 1 hour forward requires 5 separate commands.

#### Proposed Solution

New subcommand: `/raid bulk-edit`

```
/raid bulk-edit filter:[upcoming|last_7_days|next_7_days] shift_time:[+2:00|-1:30]
```

**Implementation**:

```typescript
async function handleBulkEditRaid(interaction: ChatInputCommandInteraction) {
  // 1. Validate bulk operation permissions
  // 2. Fetch filtered raids
  // 3. Apply time shift to each
  // 4. Batch update all raids
  // 5. Batch update all embeds
  // 6. Return summary
}
```

**Parameters**:

| Param | Type | Purpose | Example |
|-------|------|---------|---------|
| `filter` | Enum | Which raids to update | `upcoming` (default) |
| `shift_time` | String | Time offset to apply | `+2:00` (add 2 hours) |
| `shift_days` | Integer | Optional: shift date too | `+3` (add 3 days) |

**Filters**:
- `upcoming`: All raids in future (default)
- `last_7_days`: Raids in past 7 days (for quick reruns)
- `next_7_days`: Raids in next 7 days
- `next_30_days`: Raids in next month
- `before:[DATE]`: Raids before specific date
- `after:[DATE]`: Raids after specific date
- `between:[DATE1]:[DATE2]`: Raids in date range

**Dry-Run Option**:

```
/raid bulk-edit filter:next_7_days shift_time:+1:00 dry_run:true
```

Shows what would change without committing.

**Response**:

```
🔄 Bulk edit results:

**Affected Raids**: 5
• Mythic Raid - Week 1: 19:30 → 20:30
• Mythic Raid - Week 2: 19:30 → 20:30
• Heroic Run: 18:00 → 19:00
• Dungeon Night: 19:00 → 20:00
• Casual Raid: 20:00 → 21:00

**Updated**: 5 raids
**Failed**: 0 raids
**Duration**: 1.2 seconds
```

**Edge Cases**:
- Bulk update results in past date (validate)
- Bulk update with closed raids (skip them)
- Partial success (some update, some fail)
- Large bulk operation (100+ raids)

**Performance**:
- Use transaction to ensure atomicity
- Batch operations for efficiency
- Target: <2 seconds for 50 raids

**Safety**:
- Require explicit confirmation (not auto-execute)
- Always show dry-run results first
- Log all changes to audit trail

---

## Medium Priority Features

### 3. 🟡 Edit Raid Channel (Move Message to Different Channel)

**Status**: Planned  
**Difficulty**: Medium (4-5 hours)  
**Impact**: Medium - Occasional need

#### Current Limitation

Raid message is locked to the channel where created. If you want to move a raid announcement to a different channel, you must delete and recreate.

#### Proposed Solution

Add optional `channel` parameter:

```
/raid edit raid_id:[id] channel:[#new-raids-channel]
```

**Implementation**:

```typescript
const newChannel = interaction.options.getChannel('channel');

// 1. Validate bot has access to new channel
// 2. Delete old message from old channel
// 3. Send new message to new channel
// 4. Update raid.messageId and raid.channelId
// 5. Keep all data (date, time, roster, etc.)
```

**What Happens**:
- Old message deleted from old channel
- New message created in new channel
- Raid ID stays the same (references consistent)
- All attendance data preserved

**Response**:

```
✅ Raid moved!

**Old Channel**: #raid-planning
**New Channel**: #active-raids

The raid announcement has been moved. All attendance data is preserved.
```

**Edge Cases**:
- Bot lacks permissions in new channel
- New channel is archived/read-only
- Old message already deleted
- New channel has topic/description that needs updating

**Permissions**:
- Require: ViewChannel, SendMessages, EmbedLinks in both channels
- Check before proceeding

---

### 4. 🟡 Role Ping Override (Re-ping on Specific Edits)

**Status**: Planned  
**Difficulty**: Medium (3-4 hours)  
**Impact**: Medium - Important date/time changes only

#### Current Limitation

Edits are silent (no ping). Important changes (date shifted, time changed significantly) might be missed by members.

#### Proposed Solution

Add optional `notify` parameter:

```
/raid edit raid_id:[id] date:2025-12-25 notify:true
```

**Behavior**:

```
By default (notify:false):
- Embed updated silently
- No role mentions in content

With notify:true:
- Embed updated
- Send new message pinging roles: "@Raider Update: Raid time changed to 20:00"
- Keep original message for history
```

**Implementation**:

```typescript
const notify = interaction.options.getBoolean('notify') ?? false;

if (notify) {
  // Send new message with role ping
  const roleMentions = buildRoleMentions(guild, raid.roles);
  await channel.send({
    content: `${roleMentions} **⚠️ Raid Update**: Time changed to ${timeStr}`,
  });
}
```

**Response When Notifying**:

```
✅ Raid updated and members notified!

**Changes**:
• Time updated from 19:30 to 20:00

**Notification**: Sent to #raid-channel pinging raid roles
```

**Safety**:
- Only allows 1 notification per 24 hours (prevent spam)
- Requires `notify:true` explicitly
- Logs all notifications

---

### 5. 🟡 Raid Description/Notes Editor

**Status**: Planned  
**Difficulty**: Low (2-3 hours)  
**Impact**: Medium - Raid context/strategy

#### Current Limitation

Raid title is updatable, but no place for detailed description or strategy notes.

#### Proposed Solution

Add optional `description` field to Raid model; allow editing via:

```
/raid edit raid_id:[id] description:"Attempting heroic difficulty, phase 2 focus"
```

Or add notes field that persists separately:

```
/raid edit raid_id:[id] notes:"Use voice chat channel #raid-call. Be on time!"
```

**Schema Addition**:

```prisma
model Raid {
  // existing fields...
  title: String         // "Mythic Raid"
  description: String?  // "Attempt on heroic, working on DPS"
  notes: String?        // "Use channel #raid-call"
}
```

**Embed Display**:

```
**Mythic Raid**
[existing roster info]

**📝 Notes**:
Use voice chat channel #raid-call. Be on time!
```

**Implementation**:
- Add 1-2 text fields to raid model
- Update embed builder to show notes
- Edit command accepts `description` and `notes` parameters
- Allow clearing notes with `notes:""`

---

### 6. 🟡 Raid Difficulty/Level Indicator

**Status**: Planned  
**Difficulty**: Low (2-3 hours)  
**Impact**: Medium - Context clarity

#### Current Limitation

Raid title might say "Heroic" but no structured difficulty field.

#### Proposed Solution

Add `difficulty` field:

```
/raid edit raid_id:[id] difficulty:[mythic|heroic|normal|raid_finder]
```

Or simpler: separate into tier:

```
/raid edit raid_id:[id] tier:[M+14|M+15|Mythic|Heroic|Normal]
```

**Embed Display**:

```
🎭 **Mythic Raid - Nerub-ar Palace**
Tier: **Mythic**
Difficulty: **Mythic Raid (400 ilvl)**
```

**Benefits**:
- Color-coded difficulty (red=mythic, orange=heroic, etc.)
- Auto-sorting in raid list
- Member expectations set

---

## Low Priority Features

### 7. 🟢 Undo/Rollback for Recent Edits

**Status**: Planned  
**Difficulty**: High (8-10 hours)  
**Impact**: Low - Rare need

#### Current Limitation

If raid leader makes mistake in edit (wrong date), they must manually correct it.

#### Proposed Solution

Maintain edit history; allow rollback:

```
/raid undo raid_id:[id]
/raid history raid_id:[id]
```

**Schema**:

```prisma
model RaidEditHistory {
  id: String
  raidId: String
  editedBy: String // User ID
  editedAt: DateTime
  changes: Json // { "date": "2025-12-20 → 2025-12-25", ... }
  raidSnapshot: Json // Full raid state before edit
}
```

**Commands**:

```
/raid undo raid_id:[id]
// Reverts to previous state

/raid history raid_id:[id]
// Shows last 5 edits with timestamps
```

**Response**:

```
✅ Raid reverted!

**Previous Edit** (reverted):
• Date changed to 2025-12-30
• Time changed to 21:00

**Now Back To**:
• Date: 2025-12-25
• Time: 19:30

**Reverted By**: AdminUser
**Timestamp**: 2 minutes ago
```

**Implementation Complexity**:
- Store full raid state on each edit
- Track who edited what and when
- Implement undo logic (restore previous state)
- Handle conflicts (can't undo if new edits happened)

**Edge Cases**:
- Undo on undo (redo?)
- Multiple undos (restore multiple steps)
- History retention (keep last 50 edits? All edits?)
- Undo by different user than editor

---

### 8. 🟢 Audit Log for All Raid Modifications

**Status**: Planned  
**Difficulty**: Medium (5-6 hours)  
**Impact**: Low - Compliance/transparency

#### Current Limitation

No record of who changed what when. Useful for accountability and dispute resolution.

#### Proposed Solution

Comprehensive audit logging:

```
/raid audit raid_id:[id]
```

**Schema**:

```prisma
model RaidAuditLog {
  id: String
  raidId: String
  guildId: String
  action: String // "created" | "edited" | "deleted" | "closed" | "refresh"
  actor: String // User ID
  actedAt: DateTime
  details: Json // What changed
  reason: String? // Optional reason
}
```

**Log Entry Example**:

```json
{
  "action": "edited",
  "actor": "user-123",
  "actedAt": "2025-12-01T20:00:00Z",
  "details": {
    "date": { "from": "2025-12-20", "to": "2025-12-25" },
    "time": { "from": "19:30", "to": "20:00" },
    "rolesPinged": false
  }
}
```

**Audit Query Response**:

```
📋 **Raid Audit Log**: Mythic Raid #abc123

**2025-12-01 20:00** - AdminUser edited
  ✏️ Date: 2025-12-20 → 2025-12-25
  ✏️ Time: 19:30 → 20:00

**2025-11-28 15:30** - AdminUser created
  ✅ Created with 40 members

**2025-11-29 10:00** - RaidLeader refreshed
  ⟳ Added 2 members, removed 1
```

**Retention**:
- Keep logs for 1 year
- Can be exported by admins
- Used for disputes/complaints

---

## Enhancement Request Template

For proposing new enhancements:

```markdown
### Title: [Brief description]

**Priority**: 🔴 High / 🟡 Medium / 🟢 Low
**Difficulty**: Low (1-2h) / Medium (3-5h) / High (6-10h)
**Impact**: What problem does it solve?

#### Current State
What's the limitation today?

#### Proposed Solution
What should the feature do?

#### Example Usage
```
/raid edit ...
```

#### Implementation Notes
What code needs to change?

#### Edge Cases
What could go wrong?

#### User Value
Why would users want this?
```

---

## Roadmap Timeline

### Phase 1 (Q1 2026)
🔴 **High Priority Only**
- Role editing with auto-rescan
- Bulk edit multiple raids

### Phase 2 (Q2 2026)
🟡 **Medium Priority**
- Channel moving
- Role ping override
- Description/notes

### Phase 3 (Q3 2026)
🟢 **Low Priority & Polish**
- Undo/rollback
- Audit logging
- Performance optimization

---

## Known Limitations (Current)

1. ❌ Cannot edit raid roles
2. ❌ Cannot move raid to different channel
3. ❌ Cannot bulk edit multiple raids
4. ❌ Cannot undo edits
5. ❌ No audit trail
6. ❌ Cannot re-notify on changes

These are candidates for future enhancement.

---

## Performance Considerations for Future Features

### Bulk Operations
- Target: <2 seconds for 50 raids
- Use database transactions
- Batch Discord API calls
- Consider rate limiting

### History/Audit Logging
- Snapshot storage strategy (full vs delta)
- Query performance on large history
- Cleanup/archival policy
- Storage costs (1 year history = 50KB per raid)

### Role Scanning Optimizations
- Cache guild member list per guild
- Invalidate cache on member join/leave
- Reduce API calls during edit

---

**Last Updated**: 2026-02-01  
**Version**: 1.0  
**Maintained By**: RaidPresence Development Team
