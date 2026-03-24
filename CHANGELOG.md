# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [0.3.2] - 2026-03-24

### Added
- Premium infrastructure — `PremiumTier` enum (`FREE`, `PREMIUM`, `PRO`), premium fields on Guild model, and database migration
- Entitlement service for managing premium tier lookups, weekly raid limit enforcement, and Discord SKU entitlement sync
- Startup entitlement sync — fetches all active entitlements from Discord API on bot startup to ensure DB stays in sync after restarts
- Premium gate middleware for feature access control based on guild tier
- Discord entitlement event handlers (`entitlementCreate`, `entitlementUpdate`, `entitlementDelete`) for automatic subscription sync
- `DISCORD_SKU_PREMIUM` and `DISCORD_SKU_PRO` environment variables for Discord Store SKU configuration

### Changed
- Command restructure — `/stats` now handles analytics (player stats, raid summaries), `/raid` now owns archive operations (`archive`, `unarchive`, `search`)
- Weekly raid limit check refactored to use atomic `$transaction` to prevent race conditions
- `skuToTier()` moved to `entitlementService.ts` as shared export (used by both handler and startup sync)
- Added `ManageEvents` permission requirement to `/stats` command

### Fixed
- Race condition in weekly raid limit enforcement where concurrent requests could bypass the limit
- Entitlements not restored after bot restart (now synced from Discord API on startup)

---

## [0.2.0] - 2026-03-16

### Added
- Role-based character preferences for multi-raid-group members — players in multiple raid groups can now maintain different class/spec preferences per Discord role, with automatic fallback to global preferences
- CI/CD pipeline with automated testing and containerized deployments on version tags

### Changed
- Database provider hardcoded to PostgreSQL — removed SQLite switching infrastructure
- Simplified `.env.example` with explicit `DATABASE_URL` configuration
- CI/CD triggers restricted to version tag pushes only

### Removed
- `switch-db.js` script and `scripts/` directory
- `DB_ENV` environment variable and all dual-database provider logic
- SQLite development workflow

---

## [0.1.0] - 2026-02-18

### Added
- Database provider switching for development (SQLite) and production (PostgreSQL) environments
- `/stats` command consolidating statistics and archive operations
  - `archive` - Archive a raid to designated archive channel
  - `unarchive` - Restore archived raid to original channel
  - `search` - Search archived raids by name, player, or date
- Version display in embed footers with automatic version fetching from package.json
- Version management commands: `npm run version:patch/minor/major`
- Comprehensive documentation suite:
  - SETUP-GUIDE.md for installation and configuration
  - PLAYER-GUIDE.md for end-user guidance
  - DATABASE-TROUBLESHOOTING.md for common issues
  - VERSION.md for versioning system documentation
- Export script for PostgreSQL to SQLite data migration
- Detailed comments in switch-db.js explaining DB_ENV behavior

### Changed
- `/raid create` now requires explicit roles parameter; no longer uses global default from `/config raid-roles`
- Archive operations moved from `/raid pin/unpin` to `/stats archive/unarchive`
- Embed footer links reorganized into clickable inline fields
- Database configuration moved to DB_ENV variable with automatic provider switching
- Development workflow now defaults to SQLite for zero-config setup

### Deprecated
- `/config raid-roles` command - roles now specified per-raid
- Guild model `raidRoles` field - marked for removal in v1.0
- `/raid pin` and `/raid unpin` - use `/stats archive/unarchive` instead

### Removed
- PostgreSQL-only development migrations

### Fixed
- Command structure and permission handling aligned with new per-raid roles system

### Security
- DATABASE_URL secrets no longer stored in schema.prisma (environment-based)
- DB_ENV validation prevents accidental database provider mismatches
