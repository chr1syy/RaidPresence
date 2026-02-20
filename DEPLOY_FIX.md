# Production Deployment Fix: Migration Lock Mismatch

## Problem
Your deployment is crashing with:
```
Error: P3019
The datasource provider `postgresql` specified in your schema does not match 
the one specified in the migration_lock.toml, `sqlite`.
```

This happens because:
1. Your migrations were created locally using SQLite
2. The `migration_lock.toml` file is locked to `sqlite` provider
3. Production deployment tries to use PostgreSQL (`DB_ENV=prod`)
4. Prisma detects provider mismatch and crashes before any migrations run

## Solution: Reset Migrations for PostgreSQL

### Step 1: Back up current SQLite migrations (optional but recommended)
```bash
cp -r prisma/migrations prisma/migrations.sqlite-backup
```

### Step 2: Delete migration lock and history
```bash
rm -rf prisma/migrations
```

### Step 3: In production environment, create fresh PostgreSQL migration

Set your production environment variables:
```bash
export DB_ENV=prod
export DATABASE_URL="postgresql://user:password@postgres.railway.internal:5432/railway"
```

Then create initial PostgreSQL migration:
```bash
npm run db:generate
npm run db:migrate -- --name init
```

**What this does:**
- `npm run db:generate` runs `switch-db.js` which updates schema.prisma to `postgresql` provider
- Prisma regenerates client with PostgreSQL bindings
- `prisma migrate dev --name init` creates a fresh migration directory with PostgreSQL lock file
- New migration will apply your entire current schema to the PostgreSQL database

### Step 4: Verify migration was created
```bash
ls -la prisma/migrations/
cat prisma/migrations/migration_lock.toml
# Should now show: provider = "postgresql"
```

### Step 5: Deploy
```bash
npm run build
npm start
```

## Why This Works

**Before fix:**
- SQLite migrations → SQLite lock file
- Schema switches to PostgreSQL
- Prisma sees mismatch → crashes

**After fix:**
- Fresh PostgreSQL migrations → PostgreSQL lock file
- Schema stays PostgreSQL
- Prisma sees match → applies migrations successfully

## Prevention for Future Deployments

Your `switch-db.js` and npm scripts already handle provider switching correctly. The issue was one-time: migrations created with wrong provider.

For future development:
- **Local dev:** `DB_ENV=dev` (SQLite) - auto-creates migrations as you develop
- **Production:** Set `DB_ENV=prod` and `DATABASE_URL` - migrations deploy cleanly

## Important Notes

- ⚠️ **Data Loss Warning:** If your PostgreSQL database already has data, you'll need to migrate it separately. This fix assumes starting fresh on PostgreSQL.
- If you have production data, contact us for migration strategy before applying this fix.
- The SQLite backup (`migrations.sqlite-backup/`) can be deleted after confirming PostgreSQL deployment works.

## Rollback Plan

If something goes wrong:
1. Restore SQLite migrations: `rm -rf prisma/migrations && cp -r prisma/migrations.sqlite-backup prisma/migrations`
2. Set `DB_ENV=dev` and `DATABASE_URL=` in .env
3. Run `npm run db:migrate`
4. Verify with `npm run dev`
