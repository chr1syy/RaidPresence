# Railway Deployment Guide

Complete step-by-step guide to deploy RaidPresence bot to Railway.

## Prerequisites

- GitHub account
- Discord bot token and client ID
- Railway account (free tier available)

## Step 1: Push Code to GitHub

```bash
cd /var/www/RaidPresence

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Ready for Railway deployment"

# Create a new repository on GitHub.com
# Then add remote and push:
git remote add origin https://github.com/YOUR_USERNAME/RaidPresence.git
git branch -M main
git push -u origin main
```

## Step 2: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click "Login" and sign in with GitHub
3. Authorize Railway to access your repositories

## Step 3: Create New Project

1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `RaidPresence` repository
4. Railway will detect the project and start deployment

## Step 4: Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "Add PostgreSQL"
3. Railway will create a PostgreSQL database and automatically set `DATABASE_URL`

## Step 5: Configure Environment Variables

1. Click on your service (the bot deployment)
2. Go to "Variables" tab
3. Add these variables:

```
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
RAID_ROLES=
RAID_LEADER_ROLES=
```

**Note:** `DATABASE_URL` is automatically set by Railway when you add PostgreSQL.

## Step 6: Deploy

1. Railway automatically builds and deploys after detecting changes
2. Watch the "Deployments" tab for progress
3. The build process will:
   - Install dependencies
   - Run Prisma migrations
   - Deploy Discord commands
   - Start the bot

## Step 7: Verify Deployment

Check the logs:
1. Click on your service
2. Go to "Deployments" tab
3. Click the latest deployment
4. View logs to confirm:
   - ✅ Database migrations ran successfully
   - ✅ Discord commands deployed
   - ✅ Bot is ready and logged in

You should see:
```
✅ Bot is ready! Logged in as RaidPresence#5969
📊 Serving X guild(s)
✅ Guild data synchronized
```

## Step 8: Test the Bot

1. Invite bot to your Discord server (if not already)
2. Run `/config view` to see configuration
3. Set up roles: `/config raid-roles roles:YourRoles`
4. Create a test raid: `/raid create date:2026-01-15 time:20:00 title:Test Raid`

## Monitoring & Logs

- **View Logs:** Railway Dashboard → Your Service → Logs
- **Restart Bot:** Railway Dashboard → Your Service → Settings → Restart
- **Check Metrics:** Railway Dashboard → Your Service → Metrics

## Updating the Bot

When you make changes:

```bash
git add .
git commit -m "Your changes"
git push
```

Railway automatically detects the push and redeploys!

## Cost Estimate

Railway pricing (as of 2026):
- **Free Tier:** $5 credit/month
- **Small bot (1-10 servers):** ~$0-5/month (free tier)
- **Medium bot (10-100 servers):** ~$5-10/month
- **Large bot (100-1000 servers):** ~$15-30/month

You only pay for what you use!

## Troubleshooting

### Bot not starting
- Check logs for errors
- Verify `DISCORD_TOKEN` is correct
- Ensure PostgreSQL is connected

### Commands not showing
- Check if `deploy:commands` ran in logs
- Manually run: Railway Dashboard → Service → Settings → Deploy trigger

### Database errors
- Verify `DATABASE_URL` is set (should be automatic)
- Check migration logs
- Try manual migration in Railway shell

### Need help?
Check Railway docs: https://docs.railway.app

## Scaling

When your bot grows:
- Railway automatically scales
- Consider upgrading to higher tier
- Enable sharding for 1000+ servers (see code comments)

## Alternative: Manual Database Migration

If auto-migration fails, use Railway shell:

1. Railway Dashboard → Your Service → Settings
2. Click "Open Shell"
3. Run:
```bash
npx prisma migrate deploy
node dist/deploy-commands.js
```

---

🎉 **Your bot is now live and ready for multi-server deployment!**
