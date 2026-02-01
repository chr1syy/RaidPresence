---
type: reference
title: Railway Deployment Configuration
created: 2026-02-01
tags:
  - deployment
  - railway
  - production
related:
  - "[[CI-CD-SETUP]]"
  - "[[DEPLOYMENT-FLOW]]"
---

# Railway Deployment Configuration

## Overview

Railway is the production deployment platform for RaidPresence. It automatically deploys the bot when code changes reach the main branch. This document outlines the Railway configuration and how it integrates with GitHub and GitHub Actions.

## GitHub Integration

The Railway project is connected to the RaidPresence GitHub repository to enable automatic deployments. When you push changes to the main branch, Railway automatically detects the changes and redeploys the bot.

### How the Connection Works

1. **Repository Link**: Railway monitors the GitHub repository at `https://github.com/[your-org]/RaidPresence`
2. **Auto-Deploy Trigger**: Any push to the main branch automatically triggers a Railway deployment
3. **Build Verification**: Railway uses GitHub Actions test results to verify builds before deployment
4. **Webhook Integration**: GitHub sends deployment webhooks to Railway after successful tests

## Build Configuration

### Build Command

```bash
npm run build
```

**What it does:**
- Compiles TypeScript code using `tsc`
- Generates Prisma client using `prisma generate`
- Creates optimized distribution files in the `dist/` directory

**Why it's needed:**
- TypeScript must be compiled to JavaScript before the bot can run
- Prisma client must be regenerated for the production database connection
- The built output is what Railway actually executes

### Start Command

```bash
npm start
```

**What it does:**
1. Runs database migrations: `prisma migrate deploy`
2. Deploys Discord commands: `node dist/deploy-commands.js`
3. Starts the bot: `node dist/index.js`

**Why this order:**
- **Migrations first**: Ensures the production database schema is up-to-date
- **Commands next**: Registers updated commands with Discord before the bot connects
- **Bot startup last**: Bot connects to Discord with all infrastructure ready

## Environment Variables

Railway is configured with the following environment variables for production. These must be set in the Railway dashboard:

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DISCORD_TOKEN` | Bot authentication token | `NzI0ODQ1NTA0MDU0NzI5Nzky.XuK-AA.XXXXX...` |
| `DISCORD_CLIENT_ID` | Discord application ID | `724845504054729792` |
| `DISCORD_CLIENT_SECRET` | OAuth client secret | `XXXXX...` |
| `DATABASE_URL` | Production PostgreSQL connection | `postgresql://user:pass@host:5432/raid` |

### How to Set Variables

1. Go to Railway project dashboard
2. Click "Variables" or "Environment" tab
3. Add each variable with its production value
4. Railway automatically redeploys after variables are updated

### Database Connection

Railway provides a PostgreSQL database which is automatically connected via the `DATABASE_URL` environment variable. Prisma uses this to:
- Connect to the production database
- Run migrations
- Execute queries

## Auto-Deployment Flow

### Automatic Deployment Trigger

Railway automatically deploys when:

1. **Code is pushed to main branch**: Any commit to `main` triggers deployment
2. **Tests pass**: GitHub Actions validates the build before deployment proceeds
3. **No errors detected**: Railway monitors for build errors and halts if detected

### Deployment Process

1. Railway receives webhook notification of code change
2. Railway pulls the latest code from GitHub
3. Railway runs the build command: `npm run build`
4. If build succeeds, Railway runs the start command: `npm start`
5. Bot connects to Discord and becomes available
6. If errors occur, Railway rolls back to previous working version

### Monitoring Deployment

Check the Railway dashboard to see:
- **Build logs**: Shows compilation and build process output
- **Deployment status**: Current deployment state (building, running, failed)
- **Bot health**: Indicates if bot is connected to Discord
- **Recent deployments**: History of deployment attempts with timestamps

## Version Management

While Railway auto-deploys on code changes, the project uses semantic version tags (v0.2.0, v1.0.0) to:

1. **Mark release points**: Important milestones in development
2. **Trigger GitHub Actions**: Tests run when tags are pushed
3. **Document history**: Clear version history in Git
4. **Enable rollbacks**: Can easily revert to tagged versions if needed

**Note**: Railway deploys from `main` branch directly. Version tags are for tracking and GitHub Actions, not for triggering Railway deployments.

## Troubleshooting

### Deployment Fails

**Check these in order:**

1. **Review Railway build logs** - Click on failed deployment to see detailed error messages
2. **Verify environment variables** - Ensure all required variables are set in Railway dashboard
3. **Check GitHub Actions** - Confirm GitHub Actions tests passed
4. **Review package.json** - Ensure `build` and `start` scripts are correct
5. **Check database** - Verify PostgreSQL database is accessible and migrations are valid

### Bot Won't Connect

1. **Check DISCORD_TOKEN** - Verify token is valid and hasn't expired
2. **Check DISCORD_CLIENT_ID** - Confirm it matches your bot application
3. **Check Railway logs** - Look for connection errors or timeouts
4. **Verify bot is running** - Check if Railway shows "Running" status

### Database Connection Issues

1. **Verify DATABASE_URL** - Ensure connection string is correct
2. **Check database access** - Confirm PostgreSQL allows connections from Railway
3. **Review migrations** - Check if migrations are failing in Railway logs
4. **Test locally** - Try running migrations locally to identify schema issues

## Security Considerations

### Protecting Secrets

- **Never commit secrets** to Git (use `.env.example` for documentation instead)
- **Use Railway's environment variables** for all production secrets
- **Rotate tokens regularly** if compromised
- **Restrict database access** to only Railway and authorized developers

### IP Allowlisting

If your PostgreSQL database has IP restrictions:
1. Add Railway's deployment IPs to allowlist
2. Check Railway documentation for current IP ranges
3. Consider using Private Networks for enhanced security

## Next Steps

- Review [[CI-CD-SETUP]] for GitHub Actions workflow details
- Read [[DEPLOYMENT-FLOW]] for end-to-end deployment process
- Check [[CICD-CHECKLIST]] before first deployment
- Consult Railway documentation: https://docs.railway.app/

---

**Last Updated**: 2026-02-01

For questions about Railway configuration, check the Railway dashboard help or [Railway documentation](https://docs.railway.app/).
