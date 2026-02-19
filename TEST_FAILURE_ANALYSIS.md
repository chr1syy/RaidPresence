# Test Failure Analysis - RaidPresence

**Analysis Date:** Feb 19, 2026  
**Status:** 94+ test failures identified and categorized  

---

## Executive Summary

### Failure Patterns (3 Root Causes)

| Pattern | Count | Root Cause | Severity |
|---------|-------|-----------|----------|
| Missing `guild` property in raid mocks | 12+ files | Mock data incomplete | HIGH |
| Mock `options.get()` returning wrong shape | 4+ files | Mock missing `.find()` or `.get()` methods | HIGH |
| `calculateGuildStats` receiving undefined `raids` | 8+ tests | statsCalculator.ts bug | HIGH |

---

## Detailed Findings

### Issue #1: Missing `guild: { language: 'en' }` in Raid Mocks (PATTERN: QUICK WIN)

**Affected Test Files:**
- `raid-create.test.ts`
- `raid-clone.test.ts`  
- `raid-status.test.ts`
- `raid-stats.test.ts`
- `raid-attendance.test.ts`
- `security.test.ts`
- `integration/phase1.integration.test.ts`
- `integration/raid-suggest.integration.test.ts`
- `integration/raid-attendance.integration.test.ts`
- `integration/raid-archive.integration.test.ts`
- `performance/phase1.performance.test.ts`

**Error Pattern:**
```
TypeError: Cannot read properties of undefined (reading 'language')
```

**Example from raid-status.test.ts (lines 43-63):**
```typescript
function makeRaid(overrides: Record<string, any> = {}) {
  return {
    id: 'raid-1',
    guildId: 'guild-123',
    channelId: 'channel-123',
    raidDate: new Date('2026-03-01T18:00:00Z'),
    description: 'Mythic Raid Night',
    roles: 'role-raider',
    status: 'open',
    createdBy: 'user-leader',
    messageId: 'msg-1',
    attendance: [...],
    // ❌ MISSING: guild: { language: 'en' }
    ...overrides,
  };
}
```

**Fix Applied (raid-delete.test.ts lines 101, 126, 147):**
```typescript
guild: { language: 'en' }
```

**Solution:** Add `guild: { language: 'en' }` to all `makeRaid()` factory functions

---

### Issue #2: `MockCollection` Missing `.find()` Method in Some Files

**Affected Test Files:**
- `integration/phase1.integration.test.ts` - parseRoleInput calls `guild.roles.cache.find()`
- `performance/phase1.performance.test.ts` - same issue
- `integration/raid-suggest.integration.test.ts` - `interaction.options.get()` is not a function

**Error Pattern:**
```
TypeError: guild.roles.cache.find is not a function
TypeError: interaction.options.get is not a function
```

**Example from phase1.integration.test.ts:**
```typescript
class MockCollection<K, V> extends Map<K, V> {
  some(fn: ...): boolean { ... }
  filter(fn: ...): MockCollection<K, V> { ... }
  // ❌ MISSING: find() method
}
```

**Current Status in raid-create.test.ts (lines 35-40):**
```typescript
find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
  for (const [key, value] of this) {
    if (fn(value, key, this)) return value;
  }
  return undefined;
}
```

**Solution:** Add `.find()` method to all `MockCollection` classes (copy from raid-create.test.ts)

---

### Issue #3: `interaction.options.get()` Mock Shape Wrong in raid-suggest Integration

**Affected Test File:**
- `integration/raid-suggest.integration.test.ts` (lines 47-50)

**Current Mock (lines 47-50):**
```typescript
options: {
  getSubcommand: jest.fn().mockReturnValue('suggest'),
  getString: jest.fn((key: string) => {
    if (key === 'raid_id') return raidId;
    return undefined;
  }),
  // ❌ MISSING: get() method
}
```

**Error Location (commands/raid.ts:1528):**
```typescript
const raidId = interaction.options.get('raid_id', true).value as string;
```

**Solution:** Add `get()` method to mock options object:
```typescript
options: {
  getSubcommand: jest.fn().mockReturnValue('suggest'),
  getString: jest.fn(...),
  get: jest.fn((key: string, required?: boolean) => {
    if (key === 'raid_id') return { value: raidId };
    return undefined;
  }),
}
```

---

### Issue #4: `calculateGuildStats` Receives `undefined` Raids Array

**Affected Test Files:**
- `raid-stats.test.ts` (multiple tests failing)
- `integration/phase1.integration.test.ts`

**Error Pattern:**
```
TypeError: Cannot read properties of undefined (reading 'length')
at calculateGuildStats (src/utils/statsCalculator.ts:123)
```

**Code Location (statsCalculator.ts:123):**
```typescript
const totalRaids = raids.length;  // ❌ raids is undefined
```

**Example Failing Test (raid-stats.test.ts:117):**
```typescript
it('should display stats for a valid raid', async () => {
  (prisma.raid.findMany as jest.Mock).mockResolvedValue([makeRaid()]);
  // But handleRaidStats calls calculateGuildStats with undefined when raid_id provided
});
```

**Root Cause:** In handleRaidStats (commands/raid.ts:1410-1420), when `raid_id` is provided:
1. Single raid is fetched
2. `calculateGuildStats` is called with `undefined` instead of raid array
3. OR the prisma.raid.findMany mock doesn't return expected structure

**Solution:** Verify statsCalculator.ts receives correct raid array structure with attendance included

---

### Issue #5: `options.get()` Returning Wrong Shape (raid-create.test.ts)

**Affected Test Files:**
- `raid-create.test.ts` (multiple validation tests)

**Error Pattern:**
```
TypeError: Cannot read properties of null (reading 'value')
```

**Example (raid-create.test.ts:243):**
```typescript
mockInteraction.options.get = jest.fn((key: string) => {
  const values: Record<string, any> = {
    date: { value: 'not-a-date' },
    time: { value: '20:00' },
    title: { value: 'Test Raid' },
    roles: null,  // ❌ Should be { value: null } or undefined
    ping_roles: null,
  };
  return values[key] !== undefined ? values[key] : undefined;
});
```

**Code Expectation (commands/raid.ts:420):**
```typescript
const rolesInput = interaction.options.get('roles', true).value as string;
// Expects: { value: string | null } or object with .value property
```

**Solution:** Ensure all `options.get()` mocks return `{ value: X }` or `undefined`, never bare `null`

---

### Issue #6: MockCollection Methods Not Present in All Integration Tests

**Affected Test Files:**
- `security.test.ts` (MockCollection missing `.find()`)
- `performance/phase1.performance.test.ts` (MockCollection missing `.find()`)

**Current State (security.test.ts:22-36):**
```typescript
class MockCollection<K, V> extends Map<K, V> {
  some(fn: ...): boolean { ... }
  filter(fn: ...): MockCollection<K, V> { ... }
  // ❌ MISSING: find() method
}
```

**Solution:** Add `.find()` method to all MockCollection classes

---

### Issue #7: Date/Time Mocking Issues (Test Expectation Mismatch)

**Affected Test Files:**
- `raid-stats.test.ts` (period filtering)
- `raid-clone.test.ts` (timezone handling)

**Example (raid-stats.test.ts:325):**
```typescript
expect(daysDiff).toBeCloseTo(7, 0);  // Expected ~7 days, got 30
```

**Root Cause:** Mock doesn't use consistent time boundaries. "7 days" calculation uses:
- Current time + calculated offset
- But mock setup doesn't account for current date shifting

**Solution:** Use fixed dates in mocks instead of `Date.now()` or use fake timers

---

### Issue #8: Missing `find()` in buildMembersCache (performance test)

**Affected Test File:**
- `performance/phase1.performance.test.ts` (lines 81-84)

**Error:**
```
Cannot read properties of undefined (reading 'cache')
at parseRoleInput (src/commands/raid.ts:83)
```

**Issue:** `guild.roles.cache` is undefined because `buildMembersCache()` doesn't return guild structure

**Solution:** Update buildMembersCache to return full guild with roles.cache

---

## Summary by Test File

### Tier 1 - Critical (5-10 minutes to fix each)

| File | Issues | Primary Fix |
|------|--------|------------|
| `raid-create.test.ts` | Missing `guild.language`, options.get() shape | Add guild mock, fix options.get() return values |
| `raid-clone.test.ts` | Missing `guild.language`, MockCollection.find() | Add guild mock, add find() method |
| `raid-stats.test.ts` | Missing `guild.language`, calculateGuildStats bug | Add guild mock, debug statsCalculator call |
| `raid-status.test.ts` | Missing `guild.language` | Add guild mock to makeRaid() |
| `raid-attendance.test.ts` | Missing `guild.language` | Add guild mock to makeRaid() |
| `security.test.ts` | Missing `guild.language`, MockCollection.find() | Add guild mock, add find() method |

### Tier 2 - High (10-15 minutes each)

| File | Issues | Primary Fix |
|------|--------|------------|
| `integration/phase1.integration.test.ts` | Missing guild.language, MockCollection.find(), buildMembersCache | Add guild, add find(), fix buildMembersCache |
| `integration/raid-suggest.integration.test.ts` | Missing options.get() method | Add get() method to options mock |
| `integration/raid-attendance.integration.test.ts` | Missing guild.language | Add guild mock to makeRaid() |
| `integration/raid-archive.integration.test.ts` | Structural issues | Verify command structure |
| `performance/phase1.performance.test.ts` | Missing guild.language, MockCollection.find(), buildMembersCache | Add guild, add find(), fix buildMembersCache |

---

## Recommended Fix Order

1. **Phase 1 - Mock Utilities (5 min)**
   - Update `MockCollection` in all files to include `.find()` method
   - Create shared mock utility if needed

2. **Phase 2 - Simple Guild Mocks (15 min)**
   - Add `guild: { language: 'en' }` to all `makeRaid()` factories
   - Pattern: Copy from raid-delete.test.ts

3. **Phase 3 - Options.get() Mocks (10 min)**
   - Fix `options.get()` return shapes
   - Ensure all return `{ value: X }` or `undefined`

4. **Phase 4 - Deep Issues (20 min)**
   - Fix `calculateGuildStats` receiving correct data
   - Fix `buildMembersCache` to return proper guild structure
   - Debug date/time mocking

5. **Phase 5 - Integration Tests (15 min)**
   - Update integration test mocks
   - Add missing methods

---

## Success Metrics

- All test files should pass
- No "Cannot read properties of undefined" errors
- Mock objects match expected interfaces
- Mocks return consistent shapes

---

## Implementation Notes

### Copy-Paste Pattern: MockCollection.find()
```typescript
find(fn: (value: V, key: K, map: this) => boolean): V | undefined {
  for (const [key, value] of this) {
    if (fn(value, key, this)) return value;
  }
  return undefined;
}
```

### Copy-Paste Pattern: Guild Mock
```typescript
guild: {
  id: 'guild-123',
  language: 'en',
  timezoneOffset: 0,
}
```

### Copy-Paste Pattern: options.get()
```typescript
options: {
  get: jest.fn((key: string, required?: boolean) => {
    const values: Record<string, any> = {
      raid_id: { value: 'raid-123' },
      period: undefined,
      // ... add other keys
    };
    return values[key] || (required ? { value: null } : undefined);
  }),
}
```

