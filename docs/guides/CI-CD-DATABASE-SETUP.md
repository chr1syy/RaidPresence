# CI/CD Database Configuration

## GitHub Actions

### SQLite (Testing)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    env:
      DB_ENV: dev  # Use SQLite for tests
      
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - run: npm install
      - run: npm run build        # Generates SQLite client
      - run: npm run test:jest    # Run tests with SQLite
```

### PostgreSQL (Production Deploy)

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    env:
      DB_ENV: prod
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
      - run: npm run start                   # Start bot with prod config
```

---

## Railway.app

1. Go to Railway dashboard
2. Create new project
3. Add PostgreSQL plugin
4. Set environment variables:
   ```
   DB_ENV=prod
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   DISCORD_TOKEN=your_token
   DISCORD_CLIENT_ID=your_client_id
   ```
5. Deploy - Railway handles `npm run start`

---

## Environment Variable Checklist

For production deployments, verify:

- [ ] `DB_ENV=prod` is set
- [ ] `DATABASE_URL` points to PostgreSQL instance
- [ ] `DISCORD_TOKEN` is set
- [ ] `DISCORD_CLIENT_ID` is set
- [ ] Database migrations run on startup: `npx prisma migrate deploy`
- [ ] Application starts with: `npm start`
