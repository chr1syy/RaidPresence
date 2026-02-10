# PR Review - Code Fixes Reference Guide

Quick copy-paste reference for all code changes needed.

---

## Issue #1: Fix getArchiveChannel Type Signature

**File:** `src/utils/archiveManager.ts`  
**Line:** ~226  
**Severity:** CRITICAL

### Change This:
```typescript
export async function getArchiveChannel(
  guildId: string,
  client: Client
): Promise<TextChannel> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId }
  });

  if (!guild || !guild.archiveChannelId) {
    throw new Error('Archive channel not configured. Use `/config archive-channel` first.');
  }

  const channel = await client.channels.fetch(guild.archiveChannelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error('Archive channel is invalid or not accessible.');
  }

  return channel;
}
```

### To This:
```typescript
export async function getArchiveChannel(
  guildId: string,
  client: Client
): Promise<TextChannel | NewsChannel> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId }
  });

  if (!guild || !guild.archiveChannelId) {
    throw new Error('Archive channel not configured. Use `/config archive-channel` first.');
  }

  const channel = await client.channels.fetch(guild.archiveChannelId).catch(() => null);
  if (!channel || !(channel instanceof TextChannel || channel instanceof NewsChannel)) {
    throw new Error('Archive channel is invalid or not accessible.');
  }

  return channel;
}
```

---

## Issue #2: Fix archiveRaid NewsChannel Support

**File:** `src/utils/archiveManager.ts`  
**Line:** ~78  
**Severity:** CRITICAL

### Change This:
```typescript
  let originalMessage = null;
  if (raid.messageId && originalChannel instanceof TextChannel) {
    originalMessage = await originalChannel.messages.fetch(raid.messageId).catch(() => null);
  }
```

### To This:
```typescript
  let originalMessage = null;
  if (raid.messageId && (originalChannel instanceof TextChannel || originalChannel instanceof NewsChannel)) {
    originalMessage = await originalChannel.messages.fetch(raid.messageId).catch(() => null);
  }
```

---

## Issue #3: Fix searchArchive Pagination Logic

**File:** `src/utils/archiveManager.ts`  
**Line:** ~300  
**Severity:** CRITICAL

### Problematic Section:
```typescript
  // Build text search filter if query provided
  // Note: This filters by raid description at the database level
  // Player name filtering requires joining attendance, handled below
  if (query && query.trim()) {
    const lowerQuery = query.toLowerCase();
    where.OR = [
      {
        description: {
          contains: query,
          mode: 'insensitive',
        },
      },
      // Player name search is missing here!
    ];
  }
```

### Fixed Version:
```typescript
  // Build text search filter if query provided
  if (query && query.trim()) {
    where.OR = [
      {
        description: {
          contains: query,
          mode: 'insensitive',
        },
      },
      {
        attendance: {
          some: {
            username: {
              contains: query,
              mode: 'insensitive',
            },
          },
        },
      },
    ];
  }
```

**Important:** Remove client-side player-name filtering if it exists after this code.

---

## Issue #4: Remove Unused Variable

**File:** `src/utils/archiveManager.ts`  
**Line:** ~295  
**Severity:** CLEANUP

### Remove This Line:
```typescript
const lowerQuery = query.toLowerCase();
```

This variable was declared but never used. The above fix (Issue #3) uses direct query string without lowercasing since Prisma handles case-insensitive mode.

---

## Issue #5: Enforce Discord Embed Limits

**File:** `src/utils/notesFormatter.ts`  
**Line:** 26 and in formatRaidNotesEmbed()  
**Severity:** IMPORTANT

### Add Enforcement Logic:
In the `formatRaidNotesEmbed()` function, before the loop that adds fields:

```typescript
const DISCORD_FIELD_CHAR_LIMIT = 1024;
const DISCORD_FIELD_LIMIT = 25;
const DISCORD_EMBED_TOTAL_CHAR_LIMIT = 6000;

export function formatRaidNotesEmbed(
  notes: RaidNoteEntry[],
  language: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Raid Notes');

  let totalChars = embed.toJSON().length || 100; // Start with base embed size
  let fieldCount = 0;
  const addedNotes: RaidNoteEntry[] = [];

  for (const note of notes) {
    // Check field count limit
    if (fieldCount >= DISCORD_FIELD_LIMIT) {
      console.warn(`Field limit (${DISCORD_FIELD_LIMIT}) reached, stopping`);
      break;
    }

    // Calculate approximate field size
    const fieldSize = note.username.length + (note.playerNote?.length || 0) + 50;

    // Check total embed size limit
    if (totalChars + fieldSize >= DISCORD_EMBED_TOTAL_CHAR_LIMIT) {
      console.warn(`Embed size limit (${DISCORD_EMBED_TOTAL_CHAR_LIMIT}) reached, stopping`);
      break;
    }

    // Add field to embed
    embed.addFields({
      name: note.username,
      value: note.playerNote || '(no note)',
      inline: false,
    });

    totalChars += fieldSize;
    fieldCount++;
    addedNotes.push(note);
  }

  // Add warning if notes were truncated
  if (addedNotes.length < notes.length) {
    embed.setFooter({
      text: `Showing ${addedNotes.length} of ${notes.length} notes (size limit reached)`,
    });
  }

  return embed;
}
```

---

## Issue #6: Fix Truncation Message

**File:** `src/utils/notesFormatter.ts`  
**Line:** ~41  
**Severity:** IMPORTANT

### Option A - Simple Fix (Recommended):

Change This:
```typescript
function truncateFieldContent(text: string, itemCount: number, maxLength: number = DISCORD_FIELD_CHAR_LIMIT): { content: string; wasTruncated: boolean } {
  if (text.length <= maxLength) {
    return { content: text, wasTruncated: false };
  }

  // Reserve space for "...and X more" message
  const truncationMsg = `\n\n...and ${itemCount} more notes not shown`;
  const availableSpace = maxLength - truncationMsg.length;
  // ...
}
```

To This:
```typescript
function truncateFieldContent(text: string, itemCount: number, maxLength: number = DISCORD_FIELD_CHAR_LIMIT): { content: string; wasTruncated: boolean } {
  if (text.length <= maxLength) {
    return { content: text, wasTruncated: false };
  }

  // Reserve space for truncation indicator
  const truncationMsg = `\n\n(truncated)`;
  const availableSpace = maxLength - truncationMsg.length;
  // ...
}
```

### Option B - Better UX (Calculate Actual Omitted Count):

```typescript
function truncateFieldContent(
  text: string,
  itemCount: number,
  fittingCount: number,  // NEW: how many items actually fit
  maxLength: number = DISCORD_FIELD_CHAR_LIMIT
): { content: string; wasTruncated: boolean } {
  if (text.length <= maxLength) {
    return { content: text, wasTruncated: false };
  }

  // Reserve space for accurate "...and N more" message
  const omittedCount = itemCount - fittingCount;
  const truncationMsg = `\n\n...and ${omittedCount} more notes not shown`;
  const availableSpace = maxLength - truncationMsg.length;
  
  if (availableSpace <= 0) {
    return { content: text.substring(0, maxLength - 20) + '\n\n(truncated)', wasTruncated: true };
  }

  const truncated = text.substring(0, availableSpace);
  return { content: truncated + truncationMsg, wasTruncated: true };
}
```

Then update all call sites to pass `fittingCount` parameter.

---

## Issue #7: Add i18n to archiveFormatter

**File:** `src/utils/archiveFormatter.ts`  
**Line:** ~53  
**Severity:** IMPORTANT

### Change This:
```typescript
export function formatArchiveSearchEmbed(
  results: ArchiveRaidSummary[],
  query: string | null,
  period: string | null,
  language: string
): EmbedBuilder {
  const trans = getTranslations(language);

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6) // Gray for archive
    .setTitle(`📦 ${trans.archiveSearchResults}`)
    .setTimestamp(new Date());

  // ... filter info ...

  // Add up to 10 results per embed (Discord field limit)
  const displayResults = results.slice(0, 10);
  for (const raid of displayResults) {
    const raiderNames = raid.participantNames.join(', ');
    const fieldValue = 
      `**Date:** <t:${Math.floor(raid.raidDate.getTime() / 1000)}:d>\n` +
      `**Attendance:** ${raid.attendedCount}/${raid.totalInvited} (${raid.attendancePercent}%)\n` +
      `**Participants:** ${raiderNames || 'N/A'}\n` +
      `**Raid ID:** \`${raid.raidId}\``;
    
    embed.addFields({
      name: `Raid ${raid.raidId}`,
      value: fieldValue,
      inline: false,
    });
  }

  return embed;
}
```

### To This:
```typescript
export function formatArchiveSearchEmbed(
  results: ArchiveRaidSummary[],
  query: string | null,
  period: string | null,
  language: string
): EmbedBuilder {
  const trans = getTranslations(language);

  const embed = new EmbedBuilder()
    .setColor(0x95a5a6) // Gray for archive
    .setTitle(`📦 ${trans.archiveSearchResults}`)
    .setTimestamp(new Date());

  // ... filter info ...

  // Add up to 10 results per embed (Discord field limit)
  const displayResults = results.slice(0, 10);
  for (const raid of displayResults) {
    const raiderNames = raid.participantNames.join(', ');
    const fieldValue = 
      `**${trans.date}:** <t:${Math.floor(raid.raidDate.getTime() / 1000)}:d>\n` +
      `**${trans.attendance}:** ${raid.attendedCount}/${raid.totalInvited} (${raid.attendancePercent}%)\n` +
      `**${trans.participants}:** ${raiderNames || 'N/A'}\n` +
      `**${trans.raidId}:** \`${raid.raidId}\``;
    
    embed.addFields({
      name: `${trans.raid} ${raid.raidId}`,
      value: fieldValue,
      inline: false,
    });
  }

  return embed;
}
```

**Also check:**
- Add missing keys to `localization.ts` if needed: `date`, `attendance`, `participants`, `raidId`, `raid`
- Verify German translations exist for these keys

---

## Issue #8: Fix Discord Interaction Timeout

**File:** `src/events/buttonHandler.ts`  
**Line:** ~21  
**Severity:** CRITICAL

### Option A - Modal Approach (Recommended):

```typescript
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export async function handleOptOut(interaction: ButtonInteraction) {
  // IMMEDIATELY show modal (acks interaction in <100ms)
  const modal = new ModalBuilder()
    .setCustomId(`optout_modal_${Date.now()}`)
    .setTitle('Confirm Opt-Out');

  const reasonInput = new TextInputBuilder()
    .setCustomId('optout_reason')
    .setLabel('Reason for opt-out (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

// Then create a new handler for modal submission:
export async function handleOptOutSubmit(interaction: ModalSubmitInteraction) {
  const raidId = extractRaidIdFromCustomId(interaction.customId);
  const reason = interaction.fields.getTextInputValue('optout_reason');

  try {
    // NOW we can do DB queries (no timeout risk)
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
      include: { attendance: true }
    });

    if (!raid) {
      return interaction.reply({ content: 'Raid not found', ephemeral: true });
    }

    // Update attendance
    await prisma.attendance.updateMany({
      where: {
        raidId: raidId,
        userId: interaction.user.id,
      },
      data: {
        status: 'optedOut',
        optoutReason: reason || null,
      },
    });

    // Send followup (no timeout risk)
    await interaction.reply({
      content: '✓ You have opted out of this raid.',
      ephemeral: true,
    });
  } catch (error) {
    console.error('Opt-out error:', error);
    await interaction.reply({
      content: 'Failed to process opt-out',
      ephemeral: true,
    });
  }
}
```

### Option B - Defer Approach (Alternative):

```typescript
export async function handleOptOut(interaction: ButtonInteraction) {
  // IMMEDIATELY defer (acks interaction in <100ms)
  await interaction.deferReply({ ephemeral: true });

  try {
    const raidId = extractRaidIdFromCustomId(interaction.customId);

    // Now we can do DB queries
    const raid = await prisma.raid.findUnique({
      where: { id: raidId },
      include: { attendance: true }
    });

    if (!raid) {
      return interaction.editReply({ content: 'Raid not found' });
    }

    // Update attendance
    await prisma.attendance.updateMany({
      where: {
        raidId: raidId,
        userId: interaction.user.id,
      },
      data: {
        status: 'optedOut',
      },
    });

    // Use editReply or followUp (not reply)
    await interaction.editReply({
      content: '✓ You have opted out of this raid.',
    });
  } catch (error) {
    console.error('Opt-out error:', error);
    await interaction.editReply({
      content: 'Failed to process opt-out',
    });
  }
}
```

**Choose one approach and implement fully.**

---

## Issue #9: Add i18n to compositionFormatter

**File:** `src/utils/compositionFormatter.ts`  
**Line:** ~57  
**Severity:** IMPORTANT

### Change Function Signature:
```typescript
// BEFORE
export function formatCompositionEmbed(composition: Composition): EmbedBuilder {

// AFTER
export function formatCompositionEmbed(
  composition: Composition,
  language: string = 'en'
): EmbedBuilder {
```

### Add Translation at Function Start:
```typescript
export function formatCompositionEmbed(composition: Composition, language: string = 'en'): EmbedBuilder {
  const trans = getTranslations(language);
  
  // ... rest of function
}
```

### Replace All Hardcoded Strings:
```typescript
// BEFORE
const embed = new EmbedBuilder()
  .setTitle('Composition')
  .addFields(
    {
      name: 'Tanks',
      value: `${composition.tanks.length} tanks`,
      inline: true,
    },
    {
      name: 'Healers',
      value: `${composition.healers.length} healers`,
      inline: true,
    },
    {
      name: 'Damage Dealers',
      value: `${composition.damageDealer.length} DPS`,
      inline: true,
    }
  );

// AFTER
const embed = new EmbedBuilder()
  .setTitle(trans.composition)
  .addFields(
    {
      name: trans.tanks,
      value: `${composition.tanks.length} ${trans.tanksLabel}`,
      inline: true,
    },
    {
      name: trans.healers,
      value: `${composition.healers.length} ${trans.healersLabel}`,
      inline: true,
    },
    {
      name: trans.damageDealers,
      value: `${composition.damageDealer.length} ${trans.dpsLabel}`,
      inline: true,
    }
  );
```

**Ensure localization.ts has these keys for both 'en' and 'de'**

---

## Issue #10: Remove Unused Import

**File:** `src/utils/compositionFormatter.ts`  
**Line:** 3  
**Severity:** CLEANUP

### Remove This Line:
```typescript
import { getTranslations } from './localization';
```

**Then re-add it when implementing Issue #9.**

---

## Testing Commands

After implementing all fixes, run these tests:

```bash
# Run full test suite
npm test

# Test specific files
npm test -- archiveManager
npm test -- notesFormatter
npm test -- buttonHandler

# Type check
npm run type-check

# Linter
npm run lint

# Build
npm run build
```

---

## Checklist Before Submitting

- [ ] Issue #1: getArchiveChannel accepts NewsChannel
- [ ] Issue #2: archiveRaid deletes from NewsChannel
- [ ] Issue #3: searchArchive queries player names at DB level
- [ ] Issue #4: Removed unused lowerQuery variable
- [ ] Issue #5: Embed limits enforced in formatRaidNotesEmbed
- [ ] Issue #6: Truncation message is accurate
- [ ] Issue #7: archiveFormatter uses i18n
- [ ] Issue #8: buttonHandler responds within 3 seconds
- [ ] Issue #9: compositionFormatter uses i18n
- [ ] Issue #10: Removed unused import
- [ ] All tests pass
- [ ] German language output verified
- [ ] No TypeScript errors
- [ ] No linting errors

---

**Generated from:** 10 GitHub PR review comments  
**Date:** 2026-02-10
