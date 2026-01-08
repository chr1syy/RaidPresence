# 🚀 Railway Deployment Checklist

## ✅ Pre-Deployment (Done)

- [x] Code prepared for Railway
- [x] PostgreSQL schema configured
- [x] Build scripts added to package.json
- [x] nixpacks.toml created
- [x] railway.json created
- [x] .gitignore configured
- [x] Migration system ready

## 📋 Your Deployment Steps

### Step 1: Push to GitHub

```bash
cd /var/www/RaidPresence

# Check git status
git status

# Add all files
git add .

# Commit
git commit -m "Ready for Railway deployment"

# Create repository on GitHub.com first, then:
git remote add origin https://github.com/YOUR_USERNAME/RaidPresence.git
git branch -M main
git push -u origin main
```

### Step 2: Railway Setup

1. Go to **https://railway.app**
2. Click **"Login with GitHub"**
3. Authorize Railway

### Step 3: Create Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Find and select **`RaidPresence`**
4. Railway starts building automatically

### Step 4: Add PostgreSQL

1. In your Railway project dashboard
2. Click **"+ New"**
3. Select **"Database"**
4. Click **"Add PostgreSQL"**
5. Done! DATABASE_URL is auto-configured

### Step 5: Add Environment Variables

Click on your bot service, then **"Variables"** tab:

```
Name: DISCORD_TOKEN
Value: [Paste your Discord bot token]

Name: DISCORD_CLIENT_ID
Value: [Paste your Discord client ID]

Name: RAID_ROLES
Value: [Leave empty - configure per-server]

Name: RAID_LEADER_ROLES
Value: [Leave empty - configure per-server]
```

### Step 6: Verify Deployment

1. Go to **"Deployments"** tab
2. Click the latest deployment
3. Check logs for:

```
✅ Database migrations ran
✅ Discord commands deployed
✅ Bot is ready! Logged in as RaidPresence#XXXX
📊 Serving X guild(s)
✅ Guild data synchronized
```

### Step 7: Test

1. Invite bot to your Discord server
2. Run: `/config view`
3. Configure: `/config raid-roles roles:Raider,Member`
4. Create raid: `/raid create date:2026-01-15 time:20:00 title:Test`

## 🎉 Success!

Your bot is now:
- ✅ Live on Railway
- ✅ Using PostgreSQL database
- ✅ Multi-server ready
- ✅ Auto-deploys on git push

## 💡 Tips

**View Logs:**
Railway Dashboard → Your Service → Logs tab

**Restart Bot:**
Railway Dashboard → Your Service → Settings → Restart

**Update Bot:**
```bash
git add .
git commit -m "Your changes"
git push
```
Railway auto-deploys!

**Cost Estimate:**
- Small bot: FREE (covered by $5 monthly credit)
- Medium bot: ~$5-10/month
- Large bot: ~$15-30/month

## 🆘 Troubleshooting

**Bot not starting:**
- Check DISCORD_TOKEN is correct
- Verify PostgreSQL is connected (should be automatic)
- Check deployment logs for errors

**Commands not appearing:**
- Wait 5 minutes (Discord cache)
- Re-invite bot to server
- Check logs: "Discord commands deployed" message

**Database errors:**
- Verify DATABASE_URL exists in Variables
- Check migrations ran successfully in logs
- Try redeploying

## 📚 Documentation

- Full guide: See `RAILWAY_DEPLOYMENT.md`
- Quick start: See `QUICKSTART_RAILWAY.md`
- Bot usage: See `README.md`

---

**Questions?** Check [Railway docs](https://docs.railway.app) or [Discord.js docs](https://discord.js.org)
