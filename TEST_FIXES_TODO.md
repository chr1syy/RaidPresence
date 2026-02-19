# Test Failures - Action Items

## Overview
94+ test failures across 12 test files. All failures stem from 3 root causes:
1. Missing `guild: { language: 'en' }` in raid mocks
2. Missing `.find()` method in MockCollection classes
3. Wrong shape of `options.get()` return values

## Quick Win Checklist

### Phase 1: Add MockCollection.find() Method
Files that need `.find()` added:
- [ ] raid-clone.test.ts - Add to MockCollection (line 20-34)
- [ ] security.test.ts - Add to MockCollection (line 22-36)
- [ ] performance/phase1.performance.test.ts - Add to MockCollection (line 87-100)
- [ ] integration/phase1.integration.test.ts - Add to MockCollection (line 27-49)

**Template:**
```typescript
find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
  for (const [key, value] of this) {
    if (fn(value, key, this)) return value;
  }
  return undefined;
}
```

---

### Phase 2: Add guild: { language: 'en' } to All makeRaid() Factories

**Files and Line Ranges:**
- [ ] raid-status.test.ts - makeRaid() at line 43-63
- [ ] raid-stats.test.ts - makeRaid() at line 74-93
- [ ] raid-attendance.test.ts - No explicit makeRaid found, check test setup
- [ ] security.test.ts - makeRaid() at line 47-76 (already has it on line 63-68)
- [ ] integration/phase1.integration.test.ts - Multiple raid mocks
- [ ] integration/raid-suggest.integration.test.ts - makeRaid() at line 59-89
- [ ] integration/raid-attendance.integration.test.ts - makeRecord() function
- [ ] performance/phase1.performance.test.ts - generateRaids() at line 68-84

**Template:**
```typescript
guild: {
  id: 'guild-123',
  language: 'en',
  timezoneOffset: 0,
}
```

---

### Phase 3: Fix options.get() Mock Shape

**Files and Issues:**
- [ ] raid-create.test.ts - Line 233-242: roles returns null instead of { value: null }
- [ ] integration/raid-suggest.integration.test.ts - Missing get() method entirely (lines 45-50)

**raid-create.test.ts Fix:**
```typescript
// BEFORE:
roles: null,
ping_roles: null,

// AFTER:
roles: { value: null },
ping_roles: { value: null },
```

**integration/raid-suggest.integration.test.ts Fix:**
Add get() method to options mock:
```typescript
get: jest.fn((key: string, required?: boolean) => {
  if (key === 'raid_id') return { value: raidId };
  return undefined;
}),
```

---

### Phase 4: Fix Integration Test Helper Functions

**integration/phase1.integration.test.ts:**
- [ ] buildMembersCache() needs to return full guild structure with roles.cache.find()
- [ ] Line 91-104: Update to include roles structure

**performance/phase1.performance.test.ts:**
- [ ] Same issue as phase1.integration.test.ts
- [ ] Line 103+ needs guild roles structure

**Current buildMembersCache (phase1 line 91):**
```typescript
function buildMembersCache() {
  const memberRolesCache = new MockCollection<string, any>();
  memberRolesCache.set('role-raider', { id: 'role-raider', name: 'Raider' });

  const membersCache = new Map<string, any>();
  for (let i = 1; i <= 5; i++) {
    membersCache.set(`user-${i}`, {
      user: { bot: false, id: `user-${i}` },
      displayName: `Player${i}`,
      roles: { cache: memberRolesCache },
    });
  }
  
  return membersCache;  // ❌ Returns only members, missing guild
}
```

**Should return:**
```typescript
return {
  guild: {
    id: 'guild-int',
    roles: { cache: rolesCache },  // with all raid roles
    members: { cache: membersCache },
  },
  membersCache,
};
```

---

### Phase 5: Debug calculateGuildStats Issue

**raid-stats.test.ts failures (8 tests):**
- [ ] Check what handleRaidStats passes to calculateGuildStats
- [ ] Verify prisma.raid.findMany mock returns correct structure
- [ ] Ensure attendance array is included in mock data

**Location:** commands/raid.ts around line 1410-1420

**Likely fix:** Ensure mock includes full raid + attendance structure:
```typescript
{
  id: 'raid-1',
  guildId: 'guild-123',
  attendance: [
    { status: 'attending', ... },
    { status: 'opted_out', ... },
  ],
  ...
}
```

---

## Validation Steps

After each phase, run:
```bash
npm run test:jest [filename]
```

### Phase 1 Validation
```bash
npm run test:jest -- raid-clone.test.ts
npm run test:jest -- security.test.ts
```
Expected: Failures should shift to Phase 2 issues (missing guild property)

### Phase 2 Validation
```bash
npm run test:jest -- raid-status.test.ts
npm run test:jest -- raid-stats.test.ts
npm run test:jest -- raid-attendance.test.ts
```
Expected: Most tests should pass after guild mock fixes

### Phase 3 Validation
```bash
npm run test:jest -- raid-create.test.ts
npm run test:jest -- integration/raid-suggest.integration.test.ts
```

### Phase 4 Validation
```bash
npm run test:jest -- integration/phase1.integration.test.ts
npm run test:jest -- performance/phase1.performance.test.ts
```

### Phase 5 Validation
```bash
npm run test:jest -- raid-stats.test.ts
```

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|-----------|
| 1 | Low - Add method to class | Use copy-paste from raid-create.test.ts |
| 2 | Low - Add property to object | Use template, verify all makeRaid() calls updated |
| 3 | Medium - Change mock behavior | Run tests after each file to verify |
| 4 | Medium - Structural changes | Read existing working code first |
| 5 | High - May require code changes | Debug with console.log if needed |

---

## Estimated Effort
- Phase 1: 10 minutes
- Phase 2: 15 minutes
- Phase 3: 10 minutes
- Phase 4: 20 minutes
- Phase 5: 30 minutes
- **Total: ~85 minutes**

---

## Notes
- All fixes are mock-related, no changes to actual source code needed
- Pattern: This is a systematic mock update to match new schema changes
- Long-term: Consider creating shared test utilities to avoid duplication
