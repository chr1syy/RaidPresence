---
type: report
title: Documentation Plan - Loop 00001
created: 2026-02-12
tags:
  - documentation
  - plan
  - raidpresence
related:
  - "[[LOOP_00001_GAPS]]"
---

# Documentation Plan - Loop 00001

## Summary
- **Total Gaps:** 27
- **Auto-Document (PENDING):** 18
- **Needs Context:** 0
- **Won't Do:** 9

## Current Coverage: 0%
## Target Coverage: 90%
## Estimated Post-Loop Coverage: 67%

---

## PENDING - Ready for Auto-Documentation

### DOC-001: translations
- **Status:** `IMPLEMENTED`
- **File:** `src/utils/localization.ts`
- **Gap ID:** GAP-002
- **Type:** Type
- **Visibility:** INTERNAL
- **Importance:** CRITICAL
- **Signature:**
  ```
  export const translations: Record<SupportedLanguage, Translations>
  ```
- **Documentation Plan:**
  - [ ] Description: Contains all translatable strings for the application
  - [ ] Parameters: SupportedLanguage key
  - [ ] Returns: Translations object
  - [ ] Examples: Access German translations
- **Implemented In:** Loop 00001
- **Documentation Added:**
  - [x] Description
  - [x] Parameters (2)
  - [x] Returns
  - [x] Example

### DOC-002: command (raid)
- **Status:** `IMPLEMENTED`
- **File:** `src/commands/raid.ts`
- **Gap ID:** GAP-021
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** CRITICAL
- **Signature:**
  ```
  export const command: Command
  ```
- **Documentation Plan:**
  - [x] Description: Main raid command with multiple subcommands
  - [x] Parameters: Various subcommand options
  - [x] Returns: Command execution result
  - [x] Examples: Creating a raid
  - [x] Errors: Invalid parameters
- **Implemented In:** Loop 00001
- **Documentation Added:**
  - [x] Description
  - [x] Parameters (3)
  - [x] Returns
  - [x] Example

### DOC-003: prisma
- **Status:** `IMPLEMENTED`
- **File:** `src/database/client.ts`
- **Gap ID:** GAP-027
- **Type:** Type
- **Visibility:** INTERNAL
- **Importance:** CRITICAL
- **Signature:**
  ```
  export default prisma
  ```
- **Documentation Plan:**
  - [x] Description: Prisma database client instance
  - [x] Parameters: None
  - [x] Returns: PrismaClient instance
  - [x] Examples: Querying raids
- **Implemented In:** Loop 00001
- **Documentation Added:**
  - [x] Description
  - [x] Parameters (0)
  - [x] Returns
  - [x] Example

### DOC-004: getTranslations
- **Status:** `PENDING`
- **File:** `src/utils/localization.ts`
- **Gap ID:** GAP-003
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export function getTranslations(language: string): Translations
  ```
- **Documentation Plan:**
  - [ ] Description: Returns translation object for a given language
  - [ ] Parameters: language string
  - [ ] Returns: Translations object
  - [ ] Examples: Getting English translations

### DOC-005: t
- **Status:** `PENDING`
- **File:** `src/utils/localization.ts`
- **Gap ID:** GAP-004
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export function t(language: string, key: keyof Translations, replacements?: Record<string, string | number>): string
  ```
- **Documentation Plan:**
  - [ ] Description: Translation helper function with optional replacements
  - [ ] Parameters: language, key, replacements
  - [ ] Returns: Translated string
  - [ ] Examples: Translating with placeholders

### DOC-006: WOW_SPECS
- **Status:** `PENDING`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-006
- **Type:** Type
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export const WOW_SPECS: Record<string, string[]>
  ```
- **Documentation Plan:**
  - [ ] Description: Maps WoW classes to their specializations
  - [ ] Parameters: None
  - [ ] Returns: Record of class to specs array
  - [ ] Examples: Getting specs for Druid

### DOC-007: SPEC_SYMBOLS
- **Status:** `PENDING`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-009
- **Type:** Type
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export const SPEC_SYMBOLS: Record<string, string>
  ```
- **Documentation Plan:**
  - [ ] Description: Discord emoji symbols for each class/spec combination
  - [ ] Parameters: None
  - [ ] Returns: Record of spec key to emoji
  - [ ] Examples: Getting symbol for Fury Warrior

### DOC-008: getSpecRole
- **Status:** `PENDING`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-012
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export function getSpecRole(className: string | null, specName: string | null): WoWRole | null
  ```
- **Documentation Plan:**
  - [ ] Description: Determines raid role from class/spec combination
  - [ ] Parameters: className, specName
  - [ ] Returns: WoWRole or null
  - [ ] Examples: Getting role for Restoration Druid

### DOC-009: getSpecSymbol
- **Status:** `PENDING`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-013
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export function getSpecSymbol(className: string | null, specName: string | null): string
  ```
- **Documentation Plan:**
  - [ ] Description: Returns Discord emoji for class/spec
  - [ ] Parameters: className, specName
  - [ ] Returns: Emoji string
  - [ ] Examples: Getting symbol for null inputs

### DOC-010: startRaidScheduler
- **Status:** `PENDING`
- **File:** `src/utils/raidScheduler.ts`
- **Gap ID:** GAP-015
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export function startRaidScheduler(client: Client)
  ```
- **Documentation Plan:**
  - [ ] Description: Starts background job to auto-close expired raids
  - [ ] Parameters: Discord client
  - [ ] Returns: None
  - [ ] Examples: Starting scheduler on bot startup

### DOC-011: getTimezoneFromLocale
- **Status:** `PENDING`
- **File:** `src/utils/timezoneHelper.ts`
- **Gap ID:** GAP-016
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export function getTimezoneFromLocale(locale: string | null): number | null
  ```
- **Documentation Plan:**
  - [ ] Description: Maps Discord locales to timezone offsets
  - [ ] Parameters: locale string
  - [ ] Returns: Timezone offset or null
  - [ ] Examples: Getting timezone for 'en-US'

### DOC-012: Command
- **Status:** `PENDING`
- **File:** `src/types/index.ts`
- **Gap ID:** GAP-018
- **Type:** Type
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export interface Command {
    data: SlashCommandBuilder;
    execute: (interaction: CommandInteraction) => Promise<void>;
  }
  ```
- **Documentation Plan:**
  - [ ] Description: Interface for Discord slash commands
  - [ ] Parameters: None
  - [ ] Returns: Interface structure
  - [ ] Examples: Implementing a command

### DOC-013: BotClient
- **Status:** `PENDING`
- **File:** `src/types/index.ts`
- **Gap ID:** GAP-019
- **Type:** Type
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export interface BotClient extends Client {
    commands: Collection<string, Command>;
  }
  ```
- **Documentation Plan:**
  - [ ] Description: Extended Discord client with commands collection
  - [ ] Parameters: None
  - [ ] Returns: Extended client interface
  - [ ] Examples: Accessing commands collection

### DOC-014: createRaidEmbed
- **Status:** `PENDING`
- **File:** `src/commands/raid.ts`
- **Gap ID:** GAP-022
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export async function createRaidEmbed(raidId: string, language?: string): Promise<EmbedBuilder>
  ```
- **Documentation Plan:**
  - [ ] Description: Generates Discord embed for raid display
  - [ ] Parameters: raidId, optional language
  - [ ] Returns: EmbedBuilder
  - [ ] Examples: Creating embed for raid display

### DOC-015: command (setup)
- **Status:** `PENDING`
- **File:** `src/commands/setup.ts`
- **Gap ID:** GAP-023
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export default command
  ```
- **Documentation Plan:**
  - [ ] Description: Setup command for bot configuration
  - [ ] Parameters: None
  - [ ] Returns: Command object
  - [ ] Examples: Running setup command

### DOC-016: command (config)
- **Status:** `PENDING`
- **File:** `src/commands/config.ts`
- **Gap ID:** GAP-024
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export default command
  ```
- **Documentation Plan:**
  - [ ] Description: Configuration command with multiple subcommands
  - [ ] Parameters: Various config options
  - [ ] Returns: Command object
  - [ ] Examples: Setting server config

### DOC-017: handleSelectMenu
- **Status:** `PENDING`
- **File:** `src/events/selectHandler.ts`
- **Gap ID:** GAP-025
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export async function handleSelectMenu(interaction: StringSelectMenuInteraction)
  ```
- **Documentation Plan:**
  - [ ] Description: Handles Discord select menu interactions
  - [ ] Parameters: interaction object
  - [ ] Returns: None
  - [ ] Examples: Processing class selection

### DOC-018: handleButton
- **Status:** `PENDING`
- **File:** `src/events/buttonHandler.ts`
- **Gap ID:** GAP-026
- **Type:** Function
- **Visibility:** INTERNAL
- **Importance:** HIGH
- **Signature:**
  ```
  export async function handleButton(interaction: ButtonInteraction)
  ```
- **Documentation Plan:**
  - [ ] Description: Handles Discord button interactions
  - [ ] Parameters: interaction object
  - [ ] Returns: None
  - [ ] Examples: Processing attendance buttons

---

## WON'T DO

### DOC-019: SupportedLanguage
- **Status:** `WON'T DO`
- **File:** `src/utils/localization.ts`
- **Gap ID:** GAP-001
- **Reason:** Simple type definition, self-explanatory

### DOC-020: WOW_CLASSES
- **Status:** `WON'T DO`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-005
- **Reason:** Simple constant object, self-explanatory

### DOC-021: ROLE_EMOJIS
- **Status:** `WON'T DO`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-007
- **Reason:** Simple constant object, self-explanatory

### DOC-022: WoWRole
- **Status:** `WON'T DO`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-008
- **Reason:** Simple type union, self-explanatory

### DOC-023: getClassList
- **Status:** `WON'T DO`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-010
- **Reason:** Simple utility function, self-explanatory

### DOC-024: getSpecsForClass
- **Status:** `WON'T DO`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-011
- **Reason:** Simple utility function, self-explanatory

### DOC-025: RoleComposition
- **Status:** `WON'T DO`
- **File:** `src/utils/wowData.ts`
- **Gap ID:** GAP-014
- **Reason:** Simple interface, self-explanatory

### DOC-026: getTimezoneName
- **Status:** `WON'T DO`
- **File:** `src/utils/timezoneHelper.ts`
- **Gap ID:** GAP-017
- **Reason:** Simple utility function, self-explanatory

### DOC-027: AttendanceStatus
- **Status:** `WON'T DO`
- **File:** `src/types/index.ts`
- **Gap ID:** GAP-020
- **Reason:** Simple type union, self-explanatory

---

## Documentation Order

Recommended sequence based on visibility and dependencies:

1. **DOC-003** - prisma (CRITICAL, database foundation)
2. **DOC-001** - translations (CRITICAL, localization foundation)
3. **DOC-002** - command (raid) (CRITICAL, main command)
4. **DOC-012** - Command (HIGH, command interface)
5. **DOC-013** - BotClient (HIGH, client extension)
6. **DOC-004** - getTranslations (HIGH, depends on translations)
7. **DOC-005** - t (HIGH, depends on getTranslations)
8. **DOC-006** - WOW_SPECS (HIGH, WoW data)
9. **DOC-007** - SPEC_SYMBOLS (HIGH, WoW symbols)
10. **DOC-008** - getSpecRole (HIGH, depends on WOW_SPECS)
11. **DOC-009** - getSpecSymbol (HIGH, depends on SPEC_SYMBOLS)
12. **DOC-010** - startRaidScheduler (HIGH, raid management)
13. **DOC-011** - getTimezoneFromLocale (HIGH, timezone utility)
14. **DOC-014** - createRaidEmbed (HIGH, depends on raid data)
15. **DOC-015** - command (setup) (HIGH, setup command)
16. **DOC-016** - command (config) (HIGH, config command)
17. **DOC-017** - handleSelectMenu (HIGH, interaction handler)
18. **DOC-018** - handleButton (HIGH, interaction handler)

## Related Documentation

Exports that should be documented together for consistency:

- **Localization Group:** DOC-001, DOC-004, DOC-005 - All part of the internationalization system
- **WoW Data Group:** DOC-006, DOC-007, DOC-008, DOC-009 - World of Warcraft game data utilities
- **Command Group:** DOC-012, DOC-013, DOC-002, DOC-015, DOC-016 - Discord command system
- **Event Handlers Group:** DOC-017, DOC-018 - Discord interaction handlers
- **Raid Management Group:** DOC-014, DOC-010 - Raid lifecycle management
- **Database Group:** DOC-003 - Database access
- **Utility Group:** DOC-011 - Timezone utilities