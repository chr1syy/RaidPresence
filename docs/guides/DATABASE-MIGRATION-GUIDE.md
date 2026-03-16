# Database Migration Guide - PostgreSQL

## Overview

RaidPresence uses PostgreSQL as its database. This guide covers running and managing database migrations.

---

## Setup

### Prerequisites
- PostgreSQL server running (e.g., Railway, AWS RDS)
- Connection string format: `postgresql://user:password@host:port/dbname`

### Apply Migrations

```bash
# 1. Set DATABASE_URL in your .env file

# 2. Generate Prisma client
npm run build

# 3. Run migrations
npx prisma migrate deploy
```

---

## Troubleshooting

### "Cannot find database"
```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### "Migration failed"
```bash
# Check pending migrations
npx prisma migrate status

# For production, always backup first
pg_dump $DATABASE_URL > backup.sql
```

### "Provider mismatch error"
```bash
# Rebuild Prisma client
npm run build

# Clear cache if needed
rm -rf node_modules/.prisma/client
npm run build
```

---

## CI/CD

### GitHub Actions

```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}

steps:
  - name: Generate Prisma client
    run: npm run build

  - name: Run migrations
    run: npx prisma migrate deploy
```

---

## Best Practices

1. **Always backup before migrating**
   ```bash
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
