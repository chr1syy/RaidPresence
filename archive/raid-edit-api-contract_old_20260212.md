---
type: reference
title: 'Raid Edit API Contract and Assumptions'
created: 2026-02-01
tags:
  - api-contract
  - assumptions
  - architecture
related:
  - "[[handleEditRaid]]"
  - "[[Database-Schema]]"
---

# Raid Edit API: Contract & Assumptions

This document specifies the contract for the `/raid edit` command and the assumptions it makes about the system state.

## API Contract

### Command: `/raid edit`

```
/raid edit raid_id:[ID] [date:[YYYY-MM-DD]] [time:[HH:MM]] [title:[name]]
```

#### Input Contract

| Parameter | Type | Required | Format | Constraints |
|-----------|------|----------|--------|-------------|
| `raid_id` | String | ✅ Yes | Alphanumeric | Must reference existing raid in guild |
| `date` | String | ❌ No | `YYYY-MM-DD` | Future date within 2 years |
| `time` | String | ❌ No | `HH:MM` (24h) | 00:00 to 23:59 |
| `title` | String | ❌ No | UTF-8 text | 1-256 characters |

#### Output Contract

**Success Response** (HTTP 200 equivalent):
```
✅ Raid updated successfully!

**Updated Fields:**
• [change_1]
• [change_2]

**Roster Changes:**
• Added X member(s)
• Removed Y member(s)

**Embed Status:** [status]

**Raid ID:** `[ID]`
**New Timestamp:** <t:[UNIX]:F>
```

**Error Response** (HTTP 400 equivalent):
```
❌ [Error message]
```

**Partial Success Response** (HTTP 200 with warnings):
```
✅ Raid updated successfully!
...
⚠️ Could not [operation]: [reason]
```

### Response Guarantees

#### On Success (200)
1. ✅ Raid date/time in database is updated (if provided)
2. ✅ Raid title in database is updated (if provided)
3. ✅ Member roster reflects current guild roles
4. ✅ Embed message updated in Discord (if message exists and accessible)
5. ✅ User notified with detailed change summary

#### On Validation Error (400)
1. ❌ No database changes
2. ❌ No Discord message changes
3. ❌ User-friendly error message explaining what went wrong

#### On Partial Failure (200 with ⚠️)
1. ✅ Database changes completed
2. ❌ Embed message not updated (but DB changes saved)
3. ⚠️ User notified that DB updated but Discord message couldn't be refreshed

### Status Codes (Discord Context)

| Scenario | User Sees | DB Updated | Embed Updated | Resolution |
|----------|-----------|-----------|---------------|-----------|
| Valid edit | ✅ Updated | ✅ Yes | ✅ Yes | Success |
| Invalid format | ❌ Format error | ❌ No | ❌ No | User fixes input |
| No changes | ❌ No changes | ❌ No | ❌ No | User provides new value |
| Closed raid | ❌ Cannot edit | ❌ No | ❌ No | User creates new raid |
| Missing embed | ⚠️ Partial | ✅ Yes | ❌ No | Use `/raid refresh` |
| Missing channel | ⚠️ Partial | ✅ Yes | ❌ No | Channel restored or new raid needed |
| No permissions | ❌ Access denied | ❌ No | ❌ No | User asks admin |

## API Assumptions

### Database Assumptions

#### 1. Raid Record Exists

**Assumption**: The raid being edited exists in the database and belongs to the guild.

**Implication**:
```typescript
// MUST succeed
const raid = await prisma.raid.findUnique({ where: { id: raidId } });
if (!raid) throw new Error('Raid not found');
if (raid.guildId !== interaction.guild.id) throw new Error('Wrong guild');
```

**Breaks If**:
- Raid ID is invalid (typo, made-up)
- Raid belonged to different guild (cross-guild access attempt)
- Raid was deleted after user started command

**Mitigation**:
- Validate raid_id format at Discord command level
- Check guild ownership before proceeding
- Handle race condition: raid deleted between validation and update

#### 2. Guild Record Exists

**Assumption**: The guild sending the command has a Guild record in database with timezone/language config.

**Implication**:
```typescript
const guildData = await prisma.guild.findUnique({ where: { id: guild.id } });
// MUST succeed; Guild record created on bot join
```

**Breaks If**:
- Guild record not created when bot joined
- Guild record deleted after join

**Mitigation**:
- Ensure Guild record created in bot's `guildCreate` event
- Assume Guild always exists for active interactions

#### 3. Attendance Records Exist for Current Members

**Assumption**: Every member in raid.attendance is a valid user who was part of that raid.

**Implication**:
```typescript
const currentAttendance = raid.attendance;
// Each has: userId, raidId, guildId, status, username, etc.
```

**Breaks If**:
- Attendance record corrupted or malformed
- User deleted but record remains (orphaned)

**Mitigation**:
- Database constraints prevent orphaned records
- Schema assumes valid userId references

#### 4. UserPreference Records Created for All Members

**Assumption**: When adding new members to raid, their UserPreference record exists or can be created.

**Implication**:
```typescript
await prisma.userPreference.upsert({
  where: { userId_guildId: { userId, guildId } },
  // ... will create if missing
});
```

**Breaks If**:
- User deleted but record still in guild members cache
- UserPreference FK constraint violated

**Mitigation**:
- Upsert creates record if missing
- Cache check filters out actual deletions

#### 5. Atomic Transactions (Implicit)

**Assumption**: If raid update succeeds, roster changes are applied atomically.

**Implication**:
```typescript
// Database operations are implicitly transactional
await prisma.raid.update(...);
await prisma.raidAttendance.createMany(...);
await prisma.raidAttendance.deleteMany(...);
// If any fails, transaction may be partially committed
```

**Breaks If**:
- Prisma/database connection lost mid-transaction
- Race condition: two edits simultaneously

**Mitigation**:
- Use Prisma transactions for critical operations
- Database has constraints to prevent partial states
- Edit is sequential, blocking

### Discord API Assumptions

#### 1. Guild Context Accessible

**Assumption**: `interaction.guild` exists and is fully loaded.

**Implication**:
```typescript
if (!interaction.guild) throw new Error('Guild context required');
```

**Breaks If**:
- Command run outside server (DM)
- Guild was deleted between command send and execution

**Mitigation**:
- Discord enforces guild context for this command
- DM check at command start

#### 2. Members Cache Fetchable

**Assumption**: `interaction.guild.members.fetch()` succeeds and returns all members.

**Implication**:
```typescript
await interaction.guild.members.fetch();
// All members now in cache
```

**Breaks If**:
- Bot doesn't have `ViewChannel` or `ReadMembers` intent
- Guild has >1M members (Discord API limit)
- Guild's member list is restricted

**Mitigation**:
- Ensure bot has necessary intents
- Error handling wraps member fetch
- Graceful degradation if fetch fails

#### 3. Message Edit Permission Available

**Assumption**: Bot has permission to edit the raid message.

**Implication**:
```typescript
const message = await channel.messages.fetch(raid.messageId);
await message.edit({ embeds: [...], components: [...] });
// Must have: SendMessages, EmbedLinks, ManageMessages
```

**Breaks If**:
- Bot permissions revoked after raid creation
- Channel deleted
- Message deleted
- Channel type changed (e.g., archived thread)

**Mitigation**:
- Error handling with try-catch
- Non-critical operation (DB already updated)
- Warn user with ⚠️ message

#### 4. Role Information Accessible

**Assumption**: Discord role IDs/names in `raid.roles` are still valid and accessible.

**Implication**:
```typescript
const roleIds = raid.roles.split(',').map(r => r.trim());
for (const roleId of roleIds) {
  const role = guild.roles.cache.get(roleId) || guild.roles.cache.find(r => r.name === roleId);
  if (!role) {
    // Role deleted, can't scan members with this role
  }
}
```

**Breaks If**:
- Role deleted since raid creation
- Role name changed

**Mitigation**:
- Proceed anyway with roles that still exist
- Log warning for missing roles
- User can create new raid with updated roles

### State Assumptions

#### 1. Raid Status Not Changed Between Validation and Update

**Assumption**: Raid status stays "open" from validation check to update.

**Implication**:
```typescript
// At validation:
if (raid.status === 'closed') throw new Error('Closed raid');

// ... milliseconds pass ...

// At update:
await prisma.raid.update({ where: { id }, data: {...} });
// Raid is assumed still open
```

**Breaks If**:
- Concurrent edit: another user closes raid while first edit is running
- Manual database manipulation

**Mitigation**:
- Raid is typically long-lived (hours); unlikely to close during 1-second operation
- Could use Prisma conditional updates: `update if status === 'open'`
- In practice, not an issue for Discord bot time scales

#### 2. No Concurrent Edits

**Assumption**: Only one edit happens to a raid at a time.

**Implication**:
```typescript
// Two users run /raid edit simultaneously
// Expected: last write wins, DB is consistent
// Both see success (even if conflicting changes)
```

**Breaks If**:
- Two simultaneous edits conflict
- Database gets inconsistent data

**Mitigation**:
- Discord interactions processed sequentially
- Database constraints prevent corrupt states
- In 99.99% cases, not an issue (rare concurrent edit)

#### 3. User's Permissions Don't Change During Execution

**Assumption**: User who started the command keeps their raid management permission.

**Implication**:
```typescript
// At start:
const hasPermission = await canManageRaids(member);
if (!hasPermission) throw new Error('No permission');

// ... command runs ...

// Assumed: still has permission
// (not re-checked before update)
```

**Breaks If**:
- Role removed during command execution (1 second)
- Very unlikely in practice

**Mitigation**:
- Permission check at start is sufficient
- Discord doesn't normally revoke mid-command

### Format Assumptions

#### 1. Timezone Offset Is Valid Integer

**Assumption**: `guild.timezoneOffset` is a valid number (e.g., -12 to +14).

**Implication**:
```typescript
const offsetHours = guildData.timezoneOffset || 0;
const utcDate = new Date(localTime - (offsetHours * 60 * 60 * 1000));
// Assumes valid arithmetic
```

**Breaks If**:
- Invalid timezone offset in database (e.g., 999, NaN, null)
- Guild misconfigured

**Mitigation**:
- Default to 0 if null/undefined
- Could validate offset is in [-12, 14] range
- Database schema enforces type

#### 2. Raid Roles String Format

**Assumption**: `raid.roles` is comma-separated role IDs/names (or empty).

**Implication**:
```typescript
const roleIds = raid.roles.split(',').map(r => r.trim()).filter(Boolean);
// Can be: "role1,role2,role3" or empty or whitespace
```

**Breaks If**:
- Invalid delimiter (e.g., semicolon, pipe)
- Malformed entries

**Mitigation**:
- Schema enforces format
- `.split(',')` is forgiving
- `.filter(Boolean)` removes empty entries

#### 3. Language Code Is Valid

**Assumption**: `guild.language` is a valid language code (e.g., 'en', 'de').

**Implication**:
```typescript
const trans = getTranslations(guild.language || 'en');
// Falls back to English if invalid
```

**Breaks If**:
- Language code doesn't exist in translations
- Null/undefined language

**Mitigation**:
- Default to 'en'
- `getTranslations()` handles missing languages gracefully

## Contract Violations & Recovery

### Violation: Raid Not Found

**Symptom**: `await prisma.raid.findUnique()` returns null

**Likely Cause**:
- User entered wrong raid ID
- Raid was deleted after user listed it
- Raid belongs to different guild

**Recovery**:
```typescript
if (!raid) {
  await interaction.editReply({
    content: '❌ Raid not found. Run `/raid list` to see raid IDs.'
  });
  return;
}
```

### Violation: Member Cache Incomplete

**Symptom**: Member scanning returns fewer members than expected

**Likely Cause**:
- Bot lacks "ViewChannel" or "ReadMembers" intent
- Guild has >1M members
- Network timeout during fetch

**Recovery**:
```typescript
try {
  await interaction.guild.members.fetch();
} catch (error) {
  console.error('Member fetch failed:', error);
  // Warn user, proceed with partial roster
  rosterScanError = '⚠️ Could not scan all members. Roster unchanged.';
}
```

### Violation: Message Deleted

**Symptom**: `await channel.messages.fetch(messageId)` throws 404

**Likely Cause**:
- Message deleted between raid creation and now
- Wrong channel ID stored
- Message purged

**Recovery**:
```typescript
catch (messageError) {
  console.error('Message not found:', messageError);
  embedUpdateStatus = '⚠️ Embed message was deleted. Database updated, but embed not refreshed.';
}
```

### Violation: Permission Denied

**Symptom**: `message.edit()` throws permission error

**Likely Cause**:
- Bot was removed from channel
- Bot's permissions revoked
- Channel type incompatible

**Recovery**:
```typescript
catch (error) {
  if (error.code === 50013) { // Missing Permissions
    embedUpdateStatus = '⚠️ Bot lacks permissions to update embed.';
  }
}
```

## Backward Compatibility

### Breaking Changes to Avoid

1. **Raid Schema**: Don't remove `raidDate`, `description`, `roles`, `messageId` fields
2. **Attendance Schema**: Don't remove `userId`, `raidId`, `status` fields
3. **Status Values**: Don't change 'open'/'closed'/'cancelled' meanings
4. **Permission Check**: Keep using `canManageRaids()` utility

### Safe Additions

1. Adding optional fields to Raid (default null/false)
2. Adding new status values (old code won't recognize them)
3. New error messages or fields in response
4. New parameter validation rules (backward compatible if optional)

## Security Considerations

### SQL Injection Prevention

**Assumption**: All database inputs come through Prisma ORM.

**Protection**:
```typescript
// Safe: Prisma parameterizes queries
await prisma.raid.update({ where: { id: raidId }, data: {...} });
// raidId is never concatenated into SQL string
```

### Cross-Guild Isolation

**Assumption**: Raids always checked for guild ownership.

**Protection**:
```typescript
if (raid.guildId !== interaction.guild.id) {
  throw new Error('Wrong guild');
}
// Prevents user from editing raids in other guilds
```

### Permission Enforcement

**Assumption**: Only raid leaders can edit.

**Protection**:
```typescript
const hasPermission = await canManageRaids(member);
if (!hasPermission) throw new Error('No permission');
// Prevents regular members from changing raids
```

## Observability Contracts

### Logging Assumptions

**The system assumes**:
- All errors are logged with full context
- Database operations are logged (for audit)
- Performance metrics available (timing)

### Monitoring Assumptions

**The system assumes**:
- Error rates are monitored
- Response times are tracked
- Database transaction health is monitored

---

**Last Updated**: 2026-02-01  
**Version**: 1.0  
**Status**: Current
