# Railway Deployment Fix: Automatic Migration Safety Handler

## The Problem

Railway deployment was crashing with `P3019` because:
1. Your migrations were created with SQLite (locally)
2. Railway tries to deploy with PostgreSQL 
3. The migration lock file is stuck on SQLite
4. Prisma sees the mismatch and refuses to run

You can't manually run scripts on Railway, so the solution is to **make the deployment process fix itself**.

## The Solution

Two new files work together:

### 1. `handle-migration-safety.js`
A pre-migration check script that:
- **Detects** if the schema provider (postgresql) doesn't match the migration lock (sqlite)
- **Backs up** old migrations safely to `prisma/migrations.sqlite-backup/`
- **Resets** the migration history
- **Creates** a fresh PostgreSQL migration with correct lock file
- **Verifies** everything is correct before allowing deployment to proceed

### 2. Updated `package.json` start script
```json
"start": "npm run switch-db && node handle-migration-safety.js && prisma migrate deploy && ..."
```

**New flow:**
1. `switch-db` sets provider to PostgreSQL (because `DB_ENV=prod`)
2. `handle-migration-safety.js` detects mismatch, resets migrations
3. `prisma migrate deploy` runs with fresh PostgreSQL migrations
4. Bot starts successfully

## How It Works on Railway

When Railway deploys:

```
1. npm install
   ├─ postinstall: runs switch-db + prisma generate
   └─ Sets schema to postgresql (because DB_ENV=prod)

2. npm run build
   ├─ Compiles TypeScript
   └─ Creates dist/ folder

3. npm start (in Procfile)
   ├─ switch-db: Ensures schema is still postgresql
   ├─ handle-migration-safety.js ← NEW STEP
   │  ├─ Detects sqlite lock ≠ postgresql schema
   │  ├─ Backs up migrations
   │  ├─ Resets migration history
   │  └─ Creates fresh postgresql migration
   ├─ prisma migrate deploy
   │  └─ Applies migrations (now matching provider!)
   ├─ deploy-commands.js
   └─ Bot starts
```

## What Gets Backed Up

When the safety handler runs, it creates:
- `prisma/migrations.sqlite-backup/` - Your original SQLite migrations (safe to delete after confirming deployment works)

## Verification

After Railway deployment succeeds, you'll see in the logs:

```
[Migration Safety] Starting safe migration deployment...
[Migration Safety] Current schema provider: postgresql
[Migration Safety] Migration lock provider: sqlite
[Migration Safety] ⚠️  Provider mismatch detected! Schema: postgresql, Lock: sqlite
[Migration Safety] Resetting migration history for provider switch...
[Migration Safety] ✓ Backed up to: prisma/migrations.sqlite-backup/
[Migration Safety] ✓ Migration history cleared
[Migration Safety] ✓ Prisma client generated
[Migration Safety] ✓ Migration created
[Migration Safety] ✓ Migration lock verified: postgresql
[Migration Safety] ✓ Migration history reset successfully for postgresql
[Migration Safety] ✓ Ready to deploy migrations to database
```

## What's Changed

Files modified:
- `package.json` - Updated `start` script to include safety check
- `handle-migration-safety.js` - NEW automatic migration safety handler

No changes to:
- Your schema
- Your application code
- Your `.env` setup

## Next Steps

1. **Commit these changes:**
   ```bash
   git add package.json handle-migration-safety.js
   git commit -m "fix: add automatic migration safety handler for database provider switching"
   ```

2. **Push to Railway:**
   ```bash
   git push origin raidpresence-updates
   ```

3. **Railway will automatically:**
   - Detect the push
   - Run npm install (postinstall hooks)
   - Run npm run build
   - Run npm start (which includes the safety handler)
   - Deploy successfully ✅

4. **Verify deployment:**
   - Check Railway logs for "Migration lock verified: postgresql"
   - Bot should connect and respond to commands

## Rollback (if needed)

If something unexpected happens, Railway lets you:
1. Revert the commit in your repo
2. Re-push to Railway
3. Railway will redeploy with the previous version

But the safety handler is idempotent (safe to run repeatedly), so this should not be necessary.

## Why This Is Safe

- ✅ Only activates if there's a provider mismatch
- ✅ Backs up old migrations before deleting
- ✅ Verifies everything before allowing migration deploy
- ✅ Exits with error code if anything fails (deployment stops)
- ✅ Works on Railway, local dev, or any environment
- ✅ No manual intervention needed

## FAQ

**Q: Will this delete my data?**
A: No. It only resets the migration *history* files. Your actual database schema will be recreated via the new migrations.

**Q: What if it fails?**
A: The script exits with error code 1, stopping the deployment. Railway will show the error in logs.

**Q: Can I run it locally?**
A: Yes, but you don't need to. For local development, use `npm run dev` which uses SQLite naturally.

**Q: After this deploys, do I need to do anything else?**
A: No. Just monitor the logs to confirm deployment succeeds. The backup migrations can be deleted later if desired.
