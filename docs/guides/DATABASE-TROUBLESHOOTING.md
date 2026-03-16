---
type: guide
title: Database Troubleshooting Guide
created: 2026-02-18
tags:
  - database
  - postgresql
  - troubleshooting
related:
  - "[[DATABASE-MIGRATION-GUIDE]]"
---

# Database Troubleshooting Guide

This guide covers common database issues and solutions for RaidPresence.

---

## Common Issues

### 1. "Cannot find module '@prisma/client'"

**Symptoms:**
```
Error: Cannot find module '@prisma/client'
```

**Solutions:**

```bash
# Option A: Regenerate Prisma client
npm run db:generate

# Option B: Full rebuild
npm run build

# Option C: Clear and reinstall
rm -rf node_modules/.prisma
npm install
npm run db:generate
```

**Why it happens:**
- Prisma client wasn't generated after install
- Node modules cache corruption
- Fresh install without postinstall script running

---

### 2. "Connection refused" (PostgreSQL)

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
Error: FATAL: 3D000 database "dbname" does not exist
```

**Solutions:**

```bash
# Step 1: Verify DATABASE_URL is set correctly
echo $DATABASE_URL
# Expected format: postgresql://user:password@host:port/dbname

# Step 2: Test database connectivity independently
psql $DATABASE_URL -c "SELECT 1"

# Step 3: Rebuild Prisma client
npm run build

# Step 4: Check PostgreSQL is running
# For Railway/managed services, verify connection in dashboard
# For local PostgreSQL:
psql --version
pg_isready -h localhost -p 5432
```

**Why it happens:**
- DATABASE_URL not set or malformed
- PostgreSQL service not running
- Connection credentials are wrong
- Database doesn't exist on the server

---

### 3. "Migration pending" error

**Symptoms:**
```
Error: The following migration(s) failed when applied to the database:
20260210000000_add_attendance_indexes
```

**Solutions:**

```bash
# Step 1: Check status
npx prisma migrate status

# Step 2: Try to complete pending migration
npm run db:migrate:deploy

# Step 3: Rollback and restart (if needed)
# Use your database GUI or psql to manually delete migration
# Then reset and reapply:
npm run db:migrate dev
```

**Why it happens:**
- Previous migration failed or was interrupted
- Database schema is out of sync with migration files
- Transaction deadlock (rare)

---

### 4. "UNIQUE constraint failed"

**Symptoms:**
```
Error: duplicate key value violates unique constraint
```

**Solutions:**

```bash
# Step 1: Identify the duplicate record
SELECT * FROM "UserPreference" WHERE "userId" = 'xxx' AND "guildId" = 'yyy';

# Step 2: Delete duplicate (keep one, if needed)
DELETE FROM "UserPreference" WHERE "userId" = 'xxx' AND "guildId" = 'yyy' AND "createdAt" < '2026-02-18';

# Step 3: For dev database, reset entirely
npm run db:migrate reset  # (with confirmation prompt)
```

**Why it happens:**
- Duplicate data in import/migration
- Application bug creating duplicate records
- Incomplete transaction rollback

---

### 5. "Prisma schema validation failed"

**Symptoms:**
```
Error in schema.prisma:1
 Errors:
 - Model "Raid": Field "id" already exists...
```

**Solutions:**

```bash
# Step 1: Check schema syntax
cat prisma/schema.prisma | head -20

# Step 2: Verify datasource block
grep -A 3 "datasource db" prisma/schema.prisma

# Step 3: Restore from backup if corrupted
git checkout prisma/schema.prisma

# Step 4: Regenerate Prisma client
npm run db:generate
```

**Why it happens:**
- Manual edits to schema.prisma broke syntax
- Git merge conflict in schema.prisma

---

## Verification Checklist

Use this checklist to diagnose database issues:

```bash
# 1. Database URL
echo "DATABASE_URL is set: ${DATABASE_URL:+yes}" | cut -c1-50

# 2. Database Provider
grep "provider =" prisma/schema.prisma

# 3. Prisma Client Generated
ls -la node_modules/.prisma/client/index.d.ts

# 4. Database Connectivity
psql $DATABASE_URL -c "SELECT 1" && echo "PostgreSQL: Connected" || echo "PostgreSQL: Connection failed"

# 5. Pending Migrations
npx prisma migrate status

# 6. Prisma Schema Validation
npx prisma validate
```

---

## Recovery Procedures

### Backup & Restore

```bash
# Backup current database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from backup
psql $DATABASE_URL < backup-2026-02-18-120000.sql

# Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Raid\";"
```

---

## Debugging Commands

### View Database Structure (Prisma Studio)

```bash
# Interactive web UI to browse database
npm run db:studio
# Opens http://localhost:5555 in browser
```

### Query Database Directly

```bash
psql $DATABASE_URL
postgres=> SELECT COUNT(*) FROM "Raid";
postgres=> \dt  # List all tables
postgres=> \q   # Quit
```

### Export Database for Analysis

```bash
# PostgreSQL export to SQL
pg_dump $DATABASE_URL > analysis-$(date +%Y%m%d).sql
```

---

## Prevention Tips

1. **Always backup before major operations**
   ```bash
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Use `.env.local` for sensitive data**
   - Never commit DATABASE_URL to git
   - .gitignore should include `.env.local`

3. **Run migrations before deploying**
   ```bash
   npm run db:migrate:deploy
   ```

4. **Test database operations in dev first**
   - Never test migrations on production directly
   - Always have a backup

---

## Getting Help

If you can't resolve an issue:

1. **Check Prisma docs:** https://www.prisma.io/docs/
2. **Check PostgreSQL docs:** https://www.postgresql.org/docs/
3. **Report an issue:** https://github.com/anomalyco/opencode/issues
4. **Review migration guide:** [[DATABASE-MIGRATION-GUIDE]]

---

## Version Information

This guide applies to:
- **Node.js:** 18+
- **Prisma:** 5.22.0+
- **PostgreSQL:** 12+

Last updated: 2026-02-18
