# CI/CD Database Configuration

## GitHub Actions

### PostgreSQL (Production Deploy)

```yaml
name: Deploy

on:
  push:
    tags:
      - 'v*'

jobs:
  deploy:
    runs-on: ubuntu-latest

    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}  # Set in GitHub secrets
      DISCORD_TOKEN: ${{ secrets.DISCORD_TOKEN }}
      DISCORD_CLIENT_ID: ${{ secrets.DISCORD_CLIENT_ID }}

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install
      - run: npm run build                    # Generates PostgreSQL client
      - run: npx prisma migrate deploy       # Apply migrations
      - run: npm run start                   # Start bot
```

---

## Railway.app

1. Go to Railway dashboard
2. Create new project
3. Add PostgreSQL plugin
4. Set environment variables:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DISCORD_TOKEN=your_token
   DISCORD_CLIENT_ID=your_client_id
   ```
5. Deploy - Railway handles `npm run start`

---

## Environment Variable Checklist

For production deployments, verify:

- [ ] `DATABASE_URL` points to PostgreSQL instance
- [ ] `DISCORD_TOKEN` is set
- [ ] `DISCORD_CLIENT_ID` is set
- [ ] Database migrations run on startup: `npx prisma migrate deploy`
- [ ] Application starts with: `npm start`
