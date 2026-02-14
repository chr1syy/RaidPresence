# Database Management Guide

## Overview

RaidPresence uses a **SQLite-for-development, PostgreSQL-for-production** approach:

- **Development**: SQLite (fast, zero-config, file-based)
- **Production**: PostgreSQL (robust, concurrent, enterprise-ready)

The schema automatically adapts based on `DATABASE_URL` using `prisma/generate-schema.js`.

## Quick Start

### Development Setup
```bash
# Ensure .env has SQLite URL
echo 'DATABASE_URL="file:./dev.db"' > .env

# Setup database and start developing
npm run db:migrate
npm run dev
```

### Production Deployment
```bash
# Set PostgreSQL URL in environment
export DATABASE_URL="postgresql://username:password@host:5432/dbname"

# Deploy (runs migrations automatically)
npm start
```

## Commands

| Command | Purpose | Environment |
|---------|---------|-------------|
| `npm run db:migrate` | Setup/update database | Auto-detects SQLite/PostgreSQL |
| `npm run db:generate` | Regenerate provider-aware schema + Prisma client | Auto-detects SQLite/PostgreSQL |
| `npm run db:prod-migrations` | Rebuild canonical production migration set | Requires PostgreSQL URL |
| `npm run db:migrate:deploy` | Regenerate schema then apply migrations | PostgreSQL only |
| `npm run db:studio` | Open Prisma Studio | Uses current DATABASE_URL |
| `npm start` | Production deploy with migrations | PostgreSQL only |

## Development Workflow

### Daily Development
```bash
# Start with SQLite
npm run db:migrate  # Instant setup
npm run dev         # Hot reload development

# Make schema changes in prisma/schema.base.prisma
npm run db:migrate  # Auto-updates SQLite schema
```

### Preparing for Production Deploy

**Before pushing to main**, generate PostgreSQL migrations:

```bash
# Set production DATABASE_URL temporarily
export DATABASE_URL="postgresql://prod-url-here"

# Rebuild deterministic PostgreSQL migration artifacts
npm run db:prod-migrations

# Reset to development URL
export DATABASE_URL="file:./dev.db"
```

**Then commit and push:**
```bash
git add prisma/migrations/
git commit -m "feat: add new feature + migrations"
git push origin main
```

## Production Deployment

### Automated (Recommended)
```bash
# In production environment with PostgreSQL URL set
npm start  # Automatically runs: schema generate → migrate deploy → deploy commands → start bot
```

### Manual Steps
```bash
# Apply migrations
npm run db:migrate:deploy

# Deploy Discord commands
npm run deploy

# Start bot
npm run start:local
```

## Schema Compatibility

The system handles database differences automatically:

- **PostgreSQL**: Full schema with enums, @db.Text, etc.
- **SQLite**: Enums converted to strings, @db.Text removed

**Never manually edit `prisma/schema.prisma`** - it's auto-generated from `schema.base.prisma`.

## Troubleshooting

### "Migration lock file mismatch"
```bash
# Remove old migration history and start fresh
rm -rf prisma/migrations/
npm run db:prod-migrations
```

### "Cannot find column" errors
```bash
# Regenerate Prisma client
npm run db:generate
```

### Development database corrupted
```bash
# Reset SQLite database
rm dev.db
npm run db:migrate
```

## Migration Safety

- ✅ **Zero-downtime**: PostgreSQL migrations are transactional
- ✅ **Rollback**: `prisma migrate resolve --rolled-back` for failed migrations
- ✅ **Dry-run**: `prisma migrate deploy --dry-run` to preview changes
- ✅ **Backup**: Always backup production database before major migrations

## Architecture Notes

- **Guild Isolation**: All queries include `guildId` for multi-tenant safety
- **Connection Pooling**: PostgreSQL uses connection pooling automatically
- **Indexes**: Optimized for the query patterns in `AGENTS.md`
- **Backup Strategy**: Implement regular PostgreSQL backups in production

## Pre-Push Checklist

Before pushing to main, run:

```bash
# 1. Run tests
npm run test:jest

# 2. Check linting
npm run lint

# 3. Rebuild production migration artifacts (if schema changed)
npm run db:prod-migrations

# 4. Verify migrations were created
ls prisma/migrations/
```

## Emergency Rollback

If production migration fails:

```bash
# Mark migration as rolled back
npx prisma migrate resolve --rolled-back 20260101000000_migration_name

# Or reset to previous state
npx prisma migrate reset --force
```
