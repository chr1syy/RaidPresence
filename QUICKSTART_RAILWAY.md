# 🚀 Quick Start: Deploy to Railway in 10 Minutes

## Before You Start

You need:
- ✅ Discord Bot Token & Client ID
- ✅ GitHub account
- ✅ This code ready

## 5-Step Deployment

### 1️⃣ Create GitHub Repo (2 min)

```bash
cd /var/www/RaidPresence
git init
git add .
git commit -m "Initial commit"

# Create repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/RaidPresence.git
git push -u origin main
```

### 2️⃣ Sign Up for Railway (1 min)

- Go to **[railway.app](https://railway.app)**
- Click **"Login with GitHub"**
- Authorize Railway

### 3️⃣ Deploy Your Bot (2 min)

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose **`RaidPresence`**
4. Wait for build to start

### 4️⃣ Add PostgreSQL (1 min)

1. In your project, click **"New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Done! (DATABASE_URL auto-configured)

### 5️⃣ Set Environment Variables (2 min)

1. Click your service (the bot)
2. Go to **"Variables"** tab
3. Click **"+ New Variable"**
4. Add these:

```
DISCORD_TOKEN → paste_your_token_here
DISCORD_CLIENT_ID → paste_your_client_id_here
```

Leave these empty:
```
RAID_ROLES →
RAID_LEADER_ROLES →
```

5. Click **"Deploy"** if it doesn't auto-deploy

### 6️⃣ Verify (2 min)

Check logs for:
```
✅ Bot is ready! Logged in as RaidPresence#XXXX
📊 Serving X guild(s)
✅ Guild data synchronized
```

## 🎉 Done! Your Bot is Live

### Invite Your Bot

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147502080&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your actual client ID.

### Configure Your Server

```
/config raid-roles roles:Raider,Member
/config leader-roles roles:Officer,Raid Leader
```

### Create Your First Raid

```
/raid create date:2026-01-15 time:20:00 title:Heroic Raid Night
```

## 💰 Cost

- **Your first month:** FREE ($5 credit)
- **Small bot (1-10 servers):** FREE forever
- **Growing bot:** ~$5-10/month

## 🔄 Updating

Just push to GitHub:
```bash
git add .
git commit -m "Updates"
git push
```

Railway auto-deploys! 🚀

## 📊 Monitoring

- **Logs:** Railway Dashboard → Service → Logs
- **Restart:** Railway Dashboard → Service → Settings → Restart
- **Metrics:** Railway Dashboard → Service → Metrics

## ❓ Troubleshooting

**Bot offline?**
- Check logs in Railway
- Verify `DISCORD_TOKEN` is correct
- Check PostgreSQL is connected

**Commands not showing?**
- Wait 5 minutes (Discord cache)
- Kick and re-invite bot
- Check deployment logs for errors

## 📚 Full Guide

See `RAILWAY_DEPLOYMENT.md` for detailed guide.

---

**Need help?** Check the [full README](README.md) or [Railway docs](https://docs.railway.app)
