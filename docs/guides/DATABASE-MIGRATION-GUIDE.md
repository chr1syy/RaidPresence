# Database Migration Guide - PostgreSQL & SQLite

## Overview

RaidPresence supports two database configurations:
- **Development:** SQLite (file-based, zero setup)
- **Production:** PostgreSQL (managed database, scalable)

This guide covers migrating data between them.

---

## For Development (SQLite)

### Setup SQLite Dev Environment

```bash
# 1. Set environment
export DB_ENV=dev

# 2. Generate Prisma client for SQLite
npm run build

# 3. Create/initialize database
npx prisma migrate dev --name init

# 4. Start development
npm run dev
```

### Backup SQLite Database

```bash
# Backup entire database file
cp prisma/dev.db prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)

# Export to JSON for analysis
npx prisma db pull --output-file schema-snapshot.json
```

---

## For Production (PostgreSQL)

### Setup PostgreSQL Production Environment

**Prerequisites:**
- PostgreSQL server running (e.g., Railway, AWS RDS)
- Connection string format: `postgresql://user:password@host:port/dbname`

**Setup steps:**

```bash
# 1. Set environment variables
export DB_ENV=prod
export DATABASE_URL="postgresql://user:pass@host:5432/raidpresence"

# 2. Generate Prisma client for PostgreSQL
npm run build

# 3. Run migrations
npx prisma migrate deploy

# 4. Deploy bot
npm start
```

---

## Migrating SQLite → PostgreSQL

### Option A: Export/Import with Prisma (Recommended)

```bash
# Step 1: Backup SQLite
cp prisma/dev.db prisma/dev.db.backup

# Step 2: Export from SQLite
DB_ENV=dev npx prisma db pull

# Step 3: Switch to PostgreSQL
export DB_ENV=prod
export DATABASE_URL="postgresql://..."

# Step 4: Generate schema for PostgreSQL
npm run build

# Step 5: Apply schema
npx prisma db push

# Step 6: Verify migration
npx prisma studio  # Web UI to inspect data
```

### Option B: Manual Export/Import

```bash
# Export SQLite to SQL dump
sqlite3 prisma/dev.db ".dump" > dump.sql

# Import to PostgreSQL
psql -h host -U user -d dbname -f dump.sql
```

---

## Migrating PostgreSQL → SQLite (Downgrade)

```bash
# Step 1: Backup PostgreSQL
pg_dump postgresql://user:pass@host/dbname > backup.sql

# Step 2: Switch to SQLite
export DB_ENV=dev
unset DATABASE_URL

# Step 3: Build for SQLite
npm run build

# Step 4: Create new SQLite database
npx prisma migrate dev --name restore

# Step 5: Import data manually or use third-party tools
```

---

## Troubleshooting

### "Cannot find database"
```bash
# Verify DATABASE_URL is set for production
echo $DATABASE_URL

# For PostgreSQL, test connection
psql $DATABASE_URL -c "SELECT 1"
```

### "Migration failed"
```bash
# Check pending migrations
npx prisma migrate status

# Reset database (DEV ONLY - loses all data)
DB_ENV=dev npx prisma migrate reset

# For production, always backup first
pg_dump $DATABASE_URL > backup.sql
```

### "Provider mismatch error"
```bash
# Verify correct environment is set
echo $DB_ENV

# Rebuild Prisma client
npm run build

# Clear cache if needed
rm -rf node_modules/.prisma/client
npm run build
```

---

## Database Switching in CI/CD

### GitHub Actions

```yaml
env:
  DB_ENV: prod
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

steps:
  - name: Generate Prisma client
    run: npm run build
    
  - name: Run migrations
    run: npx prisma migrate deploy
```

### Railway.app

Set environment variables in Railway dashboard:
```
DB_ENV=prod
DATABASE_URL=<your-postgresql-url>
```

---

## Best Practices

1. **Always backup before migrating**
   ```bash
   # SQLite
   cp prisma/dev.db prisma/dev.db.backup
   
   # PostgreSQL
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Test migrations locally first**
   - Always test the migration process in development
   - Verify data integrity after migration

3. **Monitor after production migration**
   - Check database connectivity
   - Verify bot is reading/writing data correctly

4. **Keep backup after successful migration**
   - Maintain backup for at least 30 days
   - Document migration date and database version

---

## Support

For issues with database migration:
1. Check troubleshooting section above
2. Verify environment variables are set correctly
3. Review Prisma migration logs: `npx prisma migrate status`
4. Check database connectivity independently of bot
