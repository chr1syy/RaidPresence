---
type: reference
title: 'Raid Edit - Known Limitations & Design Decisions'
created: 2026-02-01
tags:
  - limitations
  - design-decisions
  - architecture
related:
  - "[[handleEditRaid]]"
  - "[[Raid-Edit-Enhancements]]"
---

# Raid Edit - Known Limitations & Design Decisions

Document explaining why certain design choices were made and what trade-offs exist.

## Core Design Decisions

### 1. Raid Roles Are Immutable ✋

**Decision**: Raid roles cannot be changed during edit. To change roles, create a new raid.

**Rationale**:
1. **Preserves Intent**: Original raid composition reflects who the leader intended to invite
2. **Prevents Accidents**: Accidental role changes could remove/add many members
3. **Audit Trail**: Immutable roles = clear history of original invitations
4. **Simplifies Logic**: Reduces state complexity and edge cases

**Trade-offs**:

| Benefit | Cost |
|---------|------|
| ✅ Clear audit trail | ❌ More work to "widen" raid (new raid needed) |
| ✅ Prevents accidents | ❌ Can't fix role mistakes easily |
| ✅ Simpler code | ❌ User frustration if roles need updating |
| ✅ Clear permissions | ❌ Lost efficiency in role management |

**Workaround**: Users can still use `/raid refresh` to manually scan and update roster without creating a new raid.

**Future**: Role editing is high-priority for next release.

---

### 2. Member Status Changes Lost on Removal ❌

**Decision**: When a member loses eligibility, they're completely removed. If re-added later, status resets to "attending".

**Example**:
```
Monday: User is "attending"
Tuesday: User loses raid role → removed entirely
Tuesday: User gains raid role → re-added as "attending" (not carrying over status)
```

**Rationale**:

1. **Clean State**: Prevents status inflation (late users always re-added as late)
2. **Data Integrity**: No ambiguity about what status means
3. **Encourages Engagement**: Forces members to confirm status after role changes
4. **Simple Logic**: No complex mapping of old → new states

**Trade-offs**:

| Benefit | Cost |
|---------|------|
| ✅ No status carryover bugs | ❌ User loses "attending" status if briefly removed |
| ✅ Forces re-engagement | ❌ Frustration if role changed temporarily |
| ✅ Clear data model | ❌ Lost information about previous status |

**Specific Limitation**: If a member opts out, loses role, regains role within minutes, they get "attending" instead of "opted_out". They must opt out again.

**Mitigation**: Document this behavior to users. Could add warning message if members removed.

**Future**: Could track previous status in history and restore it.

---

### 3. Silent Embed Updates (No Re-ping) 🔇

**Decision**: Embed updates in Discord happen silently. No new message, no role ping, no notification.

**Implementation**:
```typescript
// Not this (would notify):
await channel.send({ content: "@Raider Raid updated!", embeds: [embed] });

// But this (silent):
await oldMessage.edit({ embeds: [embed] });
```

**Rationale**:

1. **Prevent Spam**: Users already saw original announcement
2. **Minor Changes**: Time shifts are incremental, not major news
3. **Discord UX**: Edit history preserved in original message
4. **Efficiency**: Single API call, not two

**Trade-offs**:

| Benefit | Cost |
|---------|------|
| ✅ No notification spam | ❌ Members might miss important changes |
| ✅ Single Discord message | ❌ Change not highlighted prominently |
| ✅ Efficient API usage | ❌ Can't re-engage members who missed |
| ✅ Clear edit history | ❌ Requires members to check Discord |

**Limitation**: If raid time changes significantly (19:00 → 15:00, moved to tomorrow), members might not notice.

**Workaround**: Raid leader can use `/raid remind` after editing, or use `/raid edit notify:true` (future feature).

**Why Not Notify by Default?**: 
- Role ping would notify even for typo corrections
- Most edits are minor (1 member removal, time +10 minutes)
- Balances active engagement with spam prevention

**Future**: Optional `notify` flag will allow re-pinging for critical edits.

---

### 4. Embed Message Location Fixed 📌

**Decision**: Raid message is locked to the channel where it was created. Edit updates that message; doesn't move it or re-send.

**Limitation**:
```
Raid created in: #raid-planning
Run: /raid edit raid_id:abc title:"New Title"
Result: Message in #raid-planning updated, NOT moved
```

**Rationale**:

1. **Deterministic**: Always know where to find the raid
2. **History**: Edit history preserved in original message
3. **Archive**: Original channel keeps raid record
4. **Simple**: No complex message tracking

**Trade-offs**:

| Benefit | Cost |
|---------|------|
| ✅ Single source of truth | ❌ Can't reorganize channels |
| ✅ Simple implementation | ❌ Archived channel might become cluttered |
| ✅ Message edit history | ❌ Raid hidden if channel archived |

**Limitation**: If you want to move a raid to a different channel, you must delete and recreate.

**Workaround**: None currently. Admins must plan channel structure before creating raids.

**Future**: `/raid edit channel:[#new-channel]` will allow moving.

---

### 5. Timezone Offset Applied at Parse Time 🌍

**Decision**: When parsing user's local time, we immediately convert to UTC using guild's timezone offset.

**Example**:
```typescript
userInput: "2025-12-25 19:30" (their local time)
guildTimezone: UTC+2
storage: 2025-12-25 17:30 (UTC)
userDisplay: 2025-12-25 19:30 (auto-converted to their timezone)
```

**Rationale**:

1. **Single Source of Truth**: All times stored in UTC
2. **Multi-Timezone Support**: Guild can have members in different timezones
3. **Discord Timestamps**: Auto-adjust to user's local timezone
4. **Consistency**: Same approach as raid creation

**Trade-offs**:

| Benefit | Cost |
|---------|------|
| ✅ Multi-timezone support | ❌ Confusing if guild tz misconfigured |
| ✅ Discord handles display | ❌ User sees different time than they entered |
| ✅ Consistent storage | ❌ Daylight savings time transitions complex |

**Limitation**: If guild timezone is configured incorrectly, all times are offset by that error.

**Example of Bug**:
```
Guild set to UTC+5, but actually UTC+2
User enters: 19:30
Stored as: 14:30 UTC (wrong!)
Displayed to user: 21:30 (confusing!)
```

**Mitigation**: Admin must configure timezone correctly with `/config timezone`.

**Known Issue**: No automatic daylight savings time adjustment. If guild is in EDT/EST, must manually update timezone when transitions happen.

**Future**: Could integrate with timezone database to auto-adjust.

---

### 6. New Members Added Without Class/Spec Preference 👤

**Decision**: When new members are added during edit, they get "attending" status but no class/spec.

**Data**:
```json
{
  "status": "attending",
  "wowClass": null,
  "wowSpec": null
}
```

**Rationale**:

1. **Data Integrity**: Don't guess user's class
2. **Force Engagement**: Member must run `/class` command to set it
3. **No Privacy Issue**: Member hasn't set preference yet for this guild
4. **Simple**: Don't need complex preference matching

**Trade-offs**:

| Benefit | Cost |
|---------|------|
| ✅ No incorrect guesses | ❌ Roster shows "❓ No Class Set" |
| ✅ Forces engagement | ❌ New members must take action |
| ✅ Privacy-safe | ❌ Roster composition unclear initially |

**Limitation**: New members appear as "❓ No Class Set" until they set their preference.

**Display**:
```
❓ No Class Set (5 members)
• NewMember1
• NewMember2
• ...
```

**User Flow**:
1. Raid edited, new members added
2. New members see raid embed with "❓ No Class Set"
3. They click "Set Class/Spec" button
4. After setting, roster updates

**Mitigation**: This is actually good—encourages immediate setup.

**Alternative Considered**: Pull from user preferences in database if available. This is implemented, but only for users who have set preferences before.

---

## Limitations & Work-Arounds

### Limitation 1: Cannot Edit Closed/Cancelled Raids

**Issue**: Once a raid is closed or cancelled, `handleEditRaid()` rejects any edit.

**Reason**: Prevents accidents; closed raids should be finalized.

**Workaround**:
```
Contact admin to reopen raid (manual DB edit) if absolutely necessary
Or: Create new raid with updated info
```

**Code**:
```typescript
if (raid.status === 'closed' || raid.status === 'cancelled') {
  // Reject edit
  throw new Error(`Cannot edit a ${raid.status} raid`);
}
```

**Future**: Could add `/raid reopen` command with additional safeguards.

---

### Limitation 2: Members Cache Incompleteness

**Issue**: If guild has >1M members or bot lacks intents, member fetch might be incomplete.

**Discord Limitation**: Discord API doesn't guarantee fetching all members efficiently for massive guilds.

**Workaround**:
```
Ensure bot has:
- GUILD_MEMBERS intent
- ViewChannel permission
- ReadMessageHistory permission

Or: Use `/config raid-roles` with specific role instead of scanning all members
```

**Code Handling**:
```typescript
try {
  await interaction.guild.members.fetch();
  // May not fetch all members in huge guild
} catch (error) {
  rosterScanError = '⚠️ Could not scan all members';
}
```

**Note**: For typical guilds (1K-50K members), this works fine.

---

### Limitation 3: Embed Won't Update If Message Deleted

**Issue**: If someone deletes the raid embed message, edit still updates database but not Discord.

**Reason**: Can't update a message that doesn't exist.

**Workaround**:
```
Run: /raid refresh raid_id:abc
This sends a new embed message and updates messageId in database
```

**Response**:
```
⚠️ Embed message was deleted. Database updated, but Discord message not found.
Consider using /raid refresh to create a new embed.
```

**Implementation**:
```typescript
try {
  const message = await channel.messages.fetch(raid.messageId);
  // If fails with 404, message deleted
} catch (error) {
  embedUpdateStatus = '⚠️ Embed message was deleted';
}
```

---

### Limitation 4: Roles Can't Have Spaces in Names

**Issue**: Role names with spaces might not parse correctly if using space-separated format.

**Example**:
```
Raid roles: "Raid Leaders, DPS Guild, Tank Squad"
If split on ",", works fine.
But if someone enters "Raid Leaders DPS Guild" expecting space delimiter, breaks.
```

**Workaround**: Always use comma-separated roles in config.

**Solution**: Current implementation uses comma delimiter exclusively. Clear in docs.

---

### Limitation 5: No Concurrent Edit Protection

**Issue**: If two raid leaders edit the same raid simultaneously, last write wins without conflict detection.

**Example**:
```
Leader1: /raid edit raid_id:abc time:19:00
Leader2: /raid edit raid_id:abc date:2025-12-25
Result: Both changes applied, but last one's response may be stale
```

**Mitigation**: Discord processes interactions sequentially per guild, so race conditions are extremely rare (<0.01%).

**Future**: Could add optimistic locking or conflict resolution.

---

### Limitation 6: Attachment Removal on Edit

**Issue**: If raid had custom images/attachments in original message, they're removed when embed updates.

**Reason**: Edit replaces entire message structure.

**Note**: Current design doesn't use attachments; just embeds and buttons. So this isn't currently an issue.

---

## Trade-Offs Documentation

### Security vs. Convenience

**We chose**: Security (strict permission checks)

**Decision**:
- Only users with `canManageRaids` permission can edit
- Guild isolation enforced
- No admin shortcuts

**Cost**:
- Slightly more friction for legitimate edits
- Can't delegate to non-raid-leader even for small changes

**Rationale**: Raid management affects attendance and guild coordination. Better safe than sorry.

---

### Accuracy vs. Performance

**We chose**: Accuracy (always re-scan members)

**Decision**:
- Every edit performs fresh member scan
- No caching of eligibility
- Authoritative against current guild state

**Cost**:
- API call to fetch all guild members (can be slow for 100K+ members)
- ~500ms latency for large guilds

**Benefit**:
- Never serves stale member list
- Roster always accurate

**Alternative Considered**: Cache member list for 5 minutes. Rejected because:
- Stale data could cause incorrect removals
- Members joining/leaving would be delayed
- Edge cases too risky

---

### Silent vs. Noisy Updates

**We chose**: Silent (no re-ping)

**Decision**:
- Embed updates in place, no announcement
- Most changes are minor
- Prevents notification fatigue

**Cost**:
- Members might miss important changes
- Requires checking Discord

**Benefit**:
- No spam for minor edits
- Historical edit visibility in Discord

**Alternative Considered**: Notify by default. Rejected because:
- Would ping members for typo corrections
- Role might get pinged 10+ times for multi-raid edit
- Spam complaints inevitable

**Compromise**: Future `notify` flag allows opt-in for critical edits.

---

### Full State vs. Delta Storage

**We chose**: Full state (when needed for rollback/history)

**Decision**: If audit logging implemented, store full raid snapshot

**Cost**: Storage overhead (~50KB per raid edit)

**Benefit**: Can restore complete state, not just deltas

**Alternative**: Only store changed fields. Simpler but harder to reconstruct.

---

## What We Learned

### Hard Lessons

1. **Timezone Math is Tricky**
   - Lesson: UTC offset direction (+ vs -) is easy to invert
   - Solution: Unit tests specifically for timezone conversion
   - Takeaway: Document with examples

2. **Null Handling is Critical**
   - Lesson: null `messageId` or `channelId` causes crashes if not checked
   - Solution: Defensive checks and graceful degradation
   - Takeaway: Assume nothing, check everything

3. **Discord API is Rate-Limited**
   - Lesson: Fetching 100K members in bulk times out
   - Solution: Batch operations, error handling
   - Takeaway: Design for scale

4. **Users Don't Read Documentation**
   - Lesson: Many support requests for things documented
   - Solution: Build into command help, give clear error messages
   - Takeaway: Help first, docs second

### Design Wins

1. **Batch Operations** ✅
   - Using `createMany()` instead of loop saves database round trips
   - ~10x faster for large rosters

2. **Permission Reuse** ✅
   - Using existing `canManageRaids()` prevents permission inconsistencies
   - Familiar to users

3. **Ephemeral Responses** ✅
   - Only user sees edit confirmation
   - Keeps channel clean, professional

---

## Future Decisions to Make

### Should We...

1. **Add Edit History?**
   - Pro: Users can see what changed and revert
   - Con: Storage cost, added complexity
   - Decision needed: Q1 2026

2. **Allow Role Changes?**
   - Pro: Users frequently request this
   - Con: More complex member scanning
   - Decision needed: Next sprint

3. **Support Dry-Run Mode?**
   - Pro: Users can preview changes before committing
   - Con: Need to refactor code to support preview
   - Decision needed: Medium priority

4. **Auto-Adjust for Daylight Savings?**
   - Pro: Removes manual timezone updates twice a year
   - Con: Complex timezone library integration
   - Decision needed: When tz issues reported

---

## Maintenance Notes

### Things to Watch

1. **Timezone Offsets**: If guilds report wrong times, check tz config first
2. **Member Scanning**: If slow, might need caching strategy
3. **Embed Updates**: If Discord API changes, might break silently
4. **Permissions**: If `canManageRaids()` behavior changes, edit might break

### Deprecated Patterns (Don't Use)

```typescript
// ❌ Don't do this:
if (newDate !== raid.raidDate) // Comparing Date objects

// ✅ Do this instead:
if (newDate.getTime() !== raid.raidDate.getTime()) // Compare timestamps
```

```typescript
// ❌ Don't do this:
updateData[changedField] = value // Dynamic object property

// ✅ Do this instead:
if (valueChanged) {
  updateData.fieldName = value; // Explicit property
}
```

---

**Last Updated**: 2026-02-01  
**Version**: 1.0  
**Status**: Current & Complete
