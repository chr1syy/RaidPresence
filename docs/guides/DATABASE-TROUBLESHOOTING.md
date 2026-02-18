---
type: guide
title: Database Troubleshooting Guide
created: 2026-02-18
tags:
  - database
  - sqlite
  - postgresql
  - troubleshooting
related:
  - "[[DATABASE-MIGRATION-GUIDE]]"
---

# Database Troubleshooting Guide

This guide covers common database issues and solutions for RaidPresence development and production environments.

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
- Prisma client wasn't generated after switching database providers
- Node modules cache corruption
- Fresh install without postinstall script running

---

### 2. "Database file not found" (SQLite)

**Symptoms:**
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Solutions:**

```bash
# Option A: Create/initialize database
npm run db:migrate

# Option B: Full reset (DEV ONLY - loses all data)
rm prisma/dev.db
npm run db:migrate dev --name init

# Option C: Verify file path
echo $DATABASE_URL
ls -la prisma/dev.db
```

**Why it happens:**
- Database file hasn't been created yet
- Incorrect DATABASE_URL path
- File permissions issue
- Disk space issue

---

### 3. "Provider mismatch" or "Invalid datasource"

**Symptoms:**
```
Error: Invalid datasource
Error: Provider mismatch between compiled Prisma schema and runtime
```

**Solutions:**

```bash
# Step 1: Verify environment variable
echo $DB_ENV  # Should be 'dev' or 'prod'

# Step 2: Verify schema has correct provider
grep "provider =" prisma/schema.prisma

# Step 3: Regenerate with correct provider
npm run switch-db
npm run db:generate

# Step 4: If still broken, nuke and rebuild
rm -rf node_modules/.prisma/client
rm prisma/schema.prisma.bak  # If backup exists
npm run build
```

**Why it happens:**
- DB_ENV not set or changed mid-session
- Schema didn't update properly during npm run switch-db
- Prisma client generated with wrong provider

---

### 4. "Connection refused" (PostgreSQL)

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

# Step 3: Check that DB_ENV is set to 'prod'
echo $DB_ENV  # Should be 'prod' for PostgreSQL

# Step 4: Rebuild with PostgreSQL provider
export DB_ENV=prod
npm run build

# Step 5: Check PostgreSQL is running
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
- DB_ENV still set to 'dev' (using SQLite driver)

---

### 5. "Migration pending" error

**Symptoms:**
```
Error: The following migration(s) failed when applied to the database:
20260210000000_add_attendance_indexes
```

**Solutions:**

```bash
# Step 1: Check status
npx prisma migrate status

# Step 2: Option A - Try to complete pending migration
npm run db:migrate:deploy

# Step 3: Option B - Rollback and restart (PostgreSQL only)
# Use your database GUI or psql to manually delete migration
# Then reset and reapply:
npm run db:migrate dev

# Step 4: Option C - For SQLite, reset entirely (DEV ONLY)
export DB_ENV=dev
rm prisma/dev.db
npm run db:migrate dev --name init
```

**Why it happens:**
- Previous migration failed or was interrupted
- Database schema is out of sync with migration files
- Transaction deadlock (rare)

---

### 6. "UNIQUE constraint failed"

**Symptoms:**
```
Error: UNIQUE constraint failed: UserPreference.userId_guildId
Error: duplicate key value violates unique constraint
```

**Solutions:**

```bash
# Step 1: Identify the duplicate record
# For PostgreSQL:
SELECT * FROM "UserPreference" WHERE userId = 'xxx' AND guildId = 'yyy';

# For SQLite:
SELECT * FROM UserPreference WHERE userId = 'xxx' AND guildId = 'yyy';

# Step 2: Delete duplicate (keep one, if needed)
DELETE FROM UserPreference WHERE userId = 'xxx' AND guildId = 'yyy' AND createdAt < '2026-02-18';

# Step 3: For dev database, reset entirely
npm run db:migrate reset  # (with confirmation prompt)
```

**Why it happens:**
- Duplicate data in import/migration
- Application bug creating duplicate records
- Incomplete transaction rollback

---

### 7. "Prisma schema validation failed"

**Symptoms:**
```
Error in schema.prisma:1
 Errors:
 - Datasource "db": Unknown value. 'sqlite2'
 - Model "Raid": Field "id" already exists...
```

**Solutions:**

```bash
# Step 1: Check schema syntax
cat prisma/schema.prisma | head -20

# Step 2: Verify datasource block
grep -A 3 "datasource db" prisma/schema.prisma

# Step 3: Restore from backup if corrupted
ls prisma/schema.prisma*
git checkout prisma/schema.prisma

# Step 4: Regenerate switch-db
npm run switch-db
npm run db:generate
```

**Why it happens:**
- Manual edits to schema.prisma broke syntax
- switch-db.js failed to update schema properly
- Git merge conflict in schema.prisma

---

## Verification Checklist

Use this checklist to diagnose database issues:

```bash
# 1. Environment Variables
echo "DB_ENV=$DB_ENV"
echo "DATABASE_URL is set: ${DATABASE_URL:+yes}${DATABASE_URL:+...}" | cut -c1-50

# 2. Database Provider
grep "provider =" prisma/schema.prisma

# 3. Prisma Client Generated
ls -la node_modules/.prisma/client/index.d.ts

# 4. Database Connectivity (SQLite)
ls -la prisma/dev.db 2>/dev/null || echo "SQLite: No dev.db found"

# 5. Database Connectivity (PostgreSQL)
psql $DATABASE_URL -c "SELECT 1" && echo "PostgreSQL: Connected" || echo "PostgreSQL: Connection failed"

# 6. Pending Migrations
npx prisma migrate status

# 7. Prisma Schema Validation
npx prisma validate
```

---

## Recovery Procedures

### Development (SQLite) - Complete Reset

```bash
# CAUTION: This deletes all local data
export DB_ENV=dev
rm -f prisma/dev.db
rm -rf prisma/migrations
npm run db:migrate dev --name init
npm run dev
```

### Production (PostgreSQL) - Backup & Restore

```bash
# Backup current database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from backup
psql $DATABASE_URL < backup-2026-02-18-120000.sql

# Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM raid;"
```

### Migrate SQLite → PostgreSQL

See [[DATABASE-MIGRATION-GUIDE]] for detailed instructions on migrating data between databases.

---

## Debugging Commands

### View Database Structure (Prisma Studio)

```bash
# Interactive web UI to browse database
npm run db:studio
# Opens http://localhost:5555 in browser
```

### Query Database Directly

**SQLite:**
```bash
sqlite3 prisma/dev.db
sqlite> SELECT COUNT(*) FROM Raid;
sqlite> .tables
sqlite> .quit
```

**PostgreSQL:**
```bash
psql $DATABASE_URL
postgres=> SELECT COUNT(*) FROM "Raid";
postgres=> \dt  # List all tables
postgres=> \q   # Quit
```

### Export Database for Analysis

```bash
# SQLite export to JSON
npm run db:studio  # Use Prisma Studio to export

# PostgreSQL export to SQL
pg_dump $DATABASE_URL > analysis-$(date +%Y%m%d).sql
```

---

## Prevention Tips

1. **Always backup before major operations**
   ```bash
   # SQLite
   cp prisma/dev.db prisma/dev.db.backup

   # PostgreSQL
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Use `.env.local` for sensitive data**
   - Never commit DATABASE_URL to git
   - .gitignore should include `.env.local`

3. **Keep environment variables consistent**
   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   export DB_ENV=dev
   export DATABASE_URL=""  # For dev (SQLite)
   ```

4. **Run migrations before deploying**
   ```bash
   npm run db:migrate:deploy  # Production
   npm run db:migrate dev     # Development
   ```

5. **Test database operations in dev first**
   - Never test migrations on production directly
   - Always have a backup

---

## Getting Help

If you can't resolve an issue:

1. **Check Prisma docs:** https://www.prisma.io/docs/
2. **Check PostgreSQL docs:** https://www.postgresql.org/docs/
3. **Check SQLite docs:** https://www.sqlite.org/docs.html
4. **Report an issue:** https://github.com/anomalyco/opencode/issues
5. **Review migration guide:** [[DATABASE-MIGRATION-GUIDE]]

---

## Version Information

This guide applies to:
- **Node.js:** 18+
- **Prisma:** 5.22.0+
- **PostgreSQL:** 12+
- **SQLite:** 3+

Last updated: 2026-02-18
