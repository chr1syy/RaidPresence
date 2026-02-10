# CLAUDE.md - RaidPresence

> Full project documentation, architecture, and implementation details are in [AGENTS.md](./AGENTS.md).

## Quick Reference

- **Stack:** TypeScript, discord.js v14, Prisma, PostgreSQL
- **Test:** `npm run test:jest` (632+ tests), `npm run test` (type check)
- **Dev:** `npm run dev` (auto-restart), `npm run deploy` (slash commands)
- **Build:** `npm run build`, `npm start` (production)
- **DB:** `npm run db:migrate` (migrations), `npm run db:generate` (client)

## Key Files

- `src/commands/raid.ts` - Main raid command (17 subcommands)
- `src/commands/config.ts` - Server configuration (6 subcommands)
- `src/utils/localization.ts` - All user-facing strings (EN/DE)
- `src/utils/permissions.ts` - Permission checks
- `prisma/schema.prisma` - Database schema (6 models + BadgeType enum)

## Rules

- All database queries MUST include `guildId` for guild isolation
- All user-facing strings MUST go through `getTranslations()` for i18n
- New commands MUST check permissions via `canManageRaids()` where applicable
- Errors MUST be caught and replied with ephemeral localized messages
- Tests MUST be added for new features (target >85% coverage)
