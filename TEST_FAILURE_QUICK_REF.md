# Test Failure Quick Reference

## All Failures at a Glance

### Test Files with Failures

```
raid-create.test.ts               ❌ 8 failures
├─ options.get() shape issues      (3)
├─ Missing guild.language          (5)
└─ Expected: Add guild mock + fix options.get()

raid-clone.test.ts                ❌ 12 failures  
├─ MockCollection.find() missing   (1)
├─ Missing guild.language          (11)
└─ Expected: Add find() + guild mock

raid-status.test.ts               ❌ 1 failure
├─ Missing guild.language          (1)
└─ Expected: Add guild mock

raid-stats.test.ts                ❌ 10 failures
├─ Missing guild.language          (8)
├─ calculateGuildStats bug         (2)
└─ Expected: Add guild mock + debug calculateGuildStats

raid-attendance.test.ts           ❌ ? failures
├─ Missing guild.language          
└─ Expected: Add guild mock

security.test.ts                  ❌ 8 failures
├─ MockCollection.find() missing   (1)
├─ Missing guild.language          (3)
├─ Migration file mocks missing    (4)
└─ Expected: Add find() + guild mock

integration/phase1.integration.test.ts        ❌ 3 failures
├─ guild.roles.cache.find() error  (1)
├─ Missing guild.language          (2)
└─ Expected: Add find() + guild mock + fix buildMembersCache

integration/raid-suggest.integration.test.ts  ❌ 13 failures
├─ options.get() missing           (13)
└─ Expected: Add get() method to options mock

integration/raid-attendance.integration.test.ts ❌ ? failures
├─ Missing guild.language          
└─ Expected: Add guild mock

integration/raid-archive.integration.test.ts   ✅ Structural tests only

performance/phase1.performance.test.ts        ❌ 4 failures
├─ guild.roles.cache.find() error  (4)
├─ MockCollection.find() missing   (1)
├─ Missing guild.language          (3)
└─ Expected: Add find() + guild mock + fix buildMembersCache
```

---

## Error Message → Root Cause Mapping

| Error Message | Root Cause | Files | Fix |
|---------------|-----------|-------|-----|
| Cannot read properties of undefined (reading 'language') | Missing `guild` property in mock | 10+ files | Add `guild: { language: 'en' }` to makeRaid() |
| guild.roles.cache.find is not a function | MockCollection missing .find() method | 4 files | Add find() method to MockCollection |
| interaction.options.get is not a function | options mock missing get() method | 1 file | Add get() method to options mock |
| Cannot read properties of null (reading 'value') | options.get() returns null instead of object | 1 file | Change return shape from null to { value: null } |
| Cannot read properties of undefined (reading 'length') | calculateGuildStats receives undefined raids | 2 files | Verify mock includes full raid+attendance structure |
| Cannot read properties of undefined (reading 'cache') | guild missing or roles undefined | 2 files | Fix buildMembersCache to return full guild structure |
| ENOENT: migration file not found | Migration mock doesn't exist | 1 test | Delete/skip the test or create migration files |

---

## Files to Modify (In Order)

### Critical Path (70 minutes)

1. **raid-clone.test.ts** (5 min)
   - Add `.find()` method to MockCollection (line 20-34)
   - Add `guild: { language: 'en' }` to makeSourceRaid() (line 68-73)

2. **raid-status.test.ts** (3 min)
   - Add `guild: { language: 'en' }` to makeRaid() (line 43-63)

3. **raid-stats.test.ts** (5 min)
   - Add `guild: { language: 'en' }` to makeRaid() (line 74-93)
   - Verify attendance mock includes all fields

4. **raid-attendance.test.ts** (2 min)
   - Add `guild: { language: 'en' }` to raid mocks

5. **raid-create.test.ts** (10 min)
   - Fix options.get() return shapes (line 233-242)
   - Ensure all return `{ value: X }` or `undefined`

6. **security.test.ts** (7 min)
   - Add `.find()` to MockCollection (line 22-36)
   - Verify guild mocks have `guild: { language: 'en' }`

7. **integration/raid-suggest.integration.test.ts** (5 min)
   - Add `get()` method to options mock (line 45-50)

8. **integration/phase1.integration.test.ts** (15 min)
   - Add `.find()` to MockCollection (line 27-49)
   - Fix buildMembersCache() to return guild structure
   - Add `guild: { language: 'en' }` to all raid mocks

9. **performance/phase1.performance.test.ts** (15 min)
   - Add `.find()` to MockCollection (line 87-100)
   - Fix buildMembersCache() to return guild structure
   - Add `guild: { language: 'en' }` to generateRaids()

10. **Debug calculateGuildStats** (10 min)
    - Verify prisma.raid.findMany returns correct structure
    - Ensure attendance array is populated

---

## Code Templates (Copy-Paste Ready)

### Template 1: MockCollection.find() Method
```typescript
find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
  for (const [key, value] of this) {
    if (fn(value, key, this)) return value;
  }
  return undefined;
}
```

### Template 2: Guild Property
```typescript
guild: {
  id: 'guild-123',
  language: 'en',
  timezoneOffset: 0,
  raidLeaderRoles: 'role-leader',
  // Add other fields as needed
}
```

### Template 3: options.get() Mock
```typescript
options: {
  getSubcommand: jest.fn().mockReturnValue('subcommand-name'),
  get: jest.fn((key: string, required?: boolean) => {
    const values: Record<string, any> = {
      parameter_name: { value: 'some-value' },
      // Add other parameters
    };
    return values[key] || (required ? { value: null } : undefined);
  }),
}
```

### Template 4: Full buildMembersCache Replacement
```typescript
function buildMembersCache() {
  const memberRolesCache = new MockCollection<string, any>();
  memberRolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

  const rolesCache = new MockCollection<string, any>();
  rolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });
  rolesCache.set('role-leader', { id: 'role-leader', name: 'Leader' });
  rolesCache.set('role-backup', { id: 'role-backup', name: 'Backup' });

  const membersCache = new MockCollection<string, any>();
  for (let i = 1; i <= 5; i++) {
    membersCache.set(`user-${i}`, {
      user: { bot: false, id: `user-${i}` },
      displayName: `Player${i}`,
      roles: { cache: memberRolesCache },
    });
  }

  return {
    guild: {
      id: 'guild-int',
      roles: { cache: rolesCache },
      members: { cache: membersCache },
    },
    membersCache,
  };
}
```

---

## Verification Checklist

After fixing each category:

- [ ] MockCollection fixes - Run: `npm run test:jest -- raid-clone.test.ts`
- [ ] Guild mocks - Run: `npm run test:jest -- raid-status.test.ts`
- [ ] options.get() - Run: `npm run test:jest -- raid-create.test.ts`
- [ ] Integration helpers - Run: `npm run test:jest -- integration/phase1.integration.test.ts`
- [ ] All tests - Run: `npm run test:jest`

---

## Summary Stats

| Category | Count | Severity | Est. Time |
|----------|-------|----------|-----------|
| Missing guild property | 50+ | HIGH | 25 min |
| MockCollection.find() | 4 | HIGH | 10 min |
| options.get() shape | 14 | HIGH | 10 min |
| calculateGuildStats | 2 | HIGH | 15 min |
| buildMembersCache | 7 | HIGH | 15 min |
| **TOTAL** | **77** | **HIGH** | **75 min** |

---

## Success Criteria

✅ All 94+ test failures resolved  
✅ No "Cannot read properties of undefined" errors  
✅ Mock objects match expected interfaces  
✅ All tests pass: `npm run test:jest`  
✅ No new failures introduced  

---

## Key Insights

1. **Root Cause**: Schema changes (adding `guild` to Raid model) weren't reflected in test mocks
2. **Pattern**: Systematic mock update needed across all test files
3. **Effort**: Mostly copy-paste work, few substantive changes
4. **Risk**: Low - only test code changes, no source code modifications
5. **Lesson**: Consider creating shared test utilities to reduce duplication
