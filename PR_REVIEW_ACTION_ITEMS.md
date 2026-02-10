# PR Review - Quick Action Items

Generated from: 10 GitHub PR review comments (2nd round)  
Repository: chr1syy/RaidPresence (PR #4)  
Date: 2026-02-10

---

## DO THIS FIRST (Critical Fixes) - 4-6 Hours

### 1. src/utils/archiveManager.ts - Lines 78, 226, 300
**Issue #3: Fix searchArchive Pagination Logic** (CRITICAL)
```
Location: searchArchive() function, line ~300
Problem: Database only filters by description, player-name search broken
Fix:
  1. Add to WHERE clause:
     attendance: { some: { username: { contains: query, mode: 'insensitive' } } }
  2. Remove client-side player-name filtering
  3. Test with player-name-only queries and pagination
```

**Issue #2: Fix archiveRaid NewsChannel Support** (CRITICAL)
```
Location: archiveRaid() function, line ~78
Problem: Original message not deleted if raid in NewsChannel
Fix:
  1. Line ~78: Change condition from:
     if (raid.messageId && originalChannel instanceof TextChannel)
     To:
     if (raid.messageId && (originalChannel instanceof TextChannel || originalChannel instanceof NewsChannel))
  2. Test message deletion in both channel types
```

**Issue #1: Fix getArchiveChannel Type Signature** (CRITICAL)
```
Location: getArchiveChannel() function, line ~226
Problem: Returns only TextChannel, but NewsChannel is allowed
Fix:
  1. Change return type: Promise<TextChannel> → Promise<TextChannel | NewsChannel>
  2. Update type guard: !(channel instanceof TextChannel) 
     → !(channel instanceof TextChannel || channel instanceof NewsChannel)
  3. Test with both channel types
```

**Issue #4: Remove Unused Variable** (CLEANUP)
```
Location: searchArchive() function, line ~295
Problem: Variable lowerQuery declared but unused
Fix:
  1. Delete line: const lowerQuery = query.toLowerCase();
```

---

### 2. src/events/buttonHandler.ts - Line 21
**Issue #8: Fix Discord Interaction Timeout** (CRITICAL)
```
Location: handleOptOut() function, line ~21
Problem: Multiple DB queries before response → timeout after 3 seconds
Fix Options:
  A) Modal Approach (Recommended):
     - Show modal immediately (acks interaction <100ms)
     - Move all DB queries to modal submit handler
     - Send followup from submit handler (no timeout)
  
  B) Defer Approach:
     - Add: await interaction.deferReply();
     - Perform DB queries
     - Use: await interaction.followUp({...})
  
Choose one and implement fully
```

---

## DO THIS SECOND (Important Fixes) - 3-4 Hours

### 3. src/utils/notesFormatter.ts - Lines 26, 41
**Issue #5: Enforce Discord Embed Limits** (IMPORTANT)
```
Location: Line 26 (constants), and formatRaidNotesEmbed() function
Problem: Limits defined but never enforced
Fix:
  1. In formatRaidNotesEmbed(), track:
     - Field count (stop at DISCORD_FIELD_LIMIT = 25)
     - Total characters (stop at DISCORD_EMBED_TOTAL_CHAR_LIMIT = 6000)
  2. Validate before adding each field
  3. Test with large note datasets
```

**Issue #6: Fix Truncation Message** (IMPORTANT)
```
Location: truncateFieldContent() function, line ~41
Problem: Message shows total count, not omitted count (confusing)
Fix (Option A - Simple):
  - Change message to: "(truncated)"
  - Clear and not misleading
  
Fix (Option B - Better):
  - Calculate actual omitted count
  - Display: "...and N more notes not shown" where N = omitted
```

---

### 4. src/utils/archiveFormatter.ts - Line 53
**Issue #7: Add Internationalization to Archive Results** (IMPORTANT)
```
Location: formatArchiveSearchEmbed() function, line ~53
Problem: Field names hardcoded in English (German guilds see English)
Fix:
  1. Add: const trans = getTranslations(language);
  2. Replace all hardcoded strings:
     "Date" → trans.date
     "Attendance" → trans.attendance
     "Participants" → trans.participants
     "Raid ID" → trans.raidId
  3. Translate footer text
  4. Create missing keys in localization.ts if needed
  5. Test with language='de'
```

---

### 5. src/utils/compositionFormatter.ts - Lines 3, 57
**Issue #9: Add Internationalization to Composition Formatter** (IMPORTANT)
```
Location: formatCompositionEmbed() function, line ~57
Problem: Only title is translated, field names are hardcoded English
Fix:
  1. Remove unused import (see Issue #10)
  2. Add: const trans = getTranslations(language);
  3. Translate all field names: name: 'Tanks' → name: trans.tanks
  4. Translate all status messages
  5. Follow pattern from attendanceFormatter.ts
  6. Test with language='de'
```

**Issue #10: Remove Unused Import** (CLEANUP)
```
Location: compositionFormatter.ts, line 3
Problem: getTranslations imported but not used
Fix:
  1. Delete: import { getTranslations } from './localization'
  2. Re-add when implementing i18n (Issue #9)
```

---

## VERIFICATION CHECKLIST

- [ ] All CRITICAL issues fixed and tested
- [ ] All IMPORTANT issues fixed and tested
- [ ] CLEANUP items removed
- [ ] German language output verified (where applicable)
- [ ] Database pagination tested with edge cases
- [ ] Button interaction timeout tested (<3 seconds)
- [ ] All tests pass
- [ ] Code reviewed
- [ ] Ready to merge

---

## SUMMARY TABLE

| Issue | Severity | File | Type | Status |
|-------|----------|------|------|--------|
| #1 | CRITICAL | archiveManager.ts | Type mismatch | TODO |
| #2 | CRITICAL | archiveManager.ts | Incomplete deletion | TODO |
| #3 | CRITICAL | archiveManager.ts | Broken pagination | TODO |
| #4 | CLEANUP | archiveManager.ts | Unused var | TODO |
| #5 | IMPORTANT | notesFormatter.ts | Dead code | TODO |
| #6 | IMPORTANT | notesFormatter.ts | Misleading message | TODO |
| #7 | IMPORTANT | archiveFormatter.ts | Missing i18n | TODO |
| #8 | CRITICAL | buttonHandler.ts | Timeout risk | TODO |
| #9 | IMPORTANT | compositionFormatter.ts | Missing i18n | TODO |
| #10 | CLEANUP | compositionFormatter.ts | Unused import | TODO |

---

**Total Estimated Effort:** 7-11 hours implementation + 2-3 hours testing
