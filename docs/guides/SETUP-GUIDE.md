---
type: guide
title: RaidPresence Setup Guide
created: 2026-02-18
tags:
  - setup
  - installation
  - getting-started
related:
  - "[[DATABASE-MIGRATION-GUIDE]]"
  - "[[DATABASE-TROUBLESHOOTING]]"
---

# RaidPresence Setup Guide

Guide for installing and configuring RaidPresence Discord bot.

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher
- **npm** 8 or higher
- **Git** for cloning the repository
- **Discord Server** (for testing)
- **Discord Bot Application** (created at https://discord.dev/applications)
- **PostgreSQL** 12+

### Check Your Versions

```bash
node --version    # Should be v18.0.0 or higher
npm --version     # Should be 8.0.0 or higher
git --version     # Any recent version
```

---

## Step 1: Clone the Repository

```bash
# Clone RaidPresence
git clone https://github.com/anomalyco/RaidPresence.git
cd RaidPresence

# Create your feature branch (optional, for development)
git checkout -b my-feature
```

---

## Step 2: Install Dependencies

```bash
# Install all dependencies
npm install
```

---

## Step 3: Environment Configuration

### Create .env File

Copy the example environment file:

```bash
cp .env.example .env
```

### Configure Environment Variables

Edit `.env` and set these required variables:

```bash
# Discord Bot Configuration
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=optional_guild_id_for_dev  # Optional: for faster command deployment in dev

# Database Configuration
DATABASE_URL="postgresql://user:password@host:port/dbname"
```

### Getting Discord Bot Token

1. Go to https://discord.com/developers/applications
2. Create or select your application
3. Go to "Bot" section → Click "Add Bot"
4. Copy the token under "TOKEN"
5. Paste into `.env` as `DISCORD_TOKEN`

### Getting Client ID

1. In Discord Developer Portal, go to "General Information"
2. Copy "APPLICATION ID"
3. Paste into `.env` as `CLIENT_ID`

### Getting Guild ID (Optional)

For faster command deployment during development:

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your test server → "Copy Server ID"
3. Paste into `.env` as `GUILD_ID`

---

## Step 4: Database Setup

```bash
# Set DATABASE_URL in your .env file, then:

# Build the project (generates Prisma client)
npm run build

# Run migrations
npm run db:migrate:deploy
```

---

## Step 5: Verify Installation

### Check Database Connection

```bash
# Browse database (opens web UI)
npm run db:studio

# Window opens at http://localhost:5555
# You should see empty tables: Guild, UserPreference, Raid, RaidAttendance
```

### Check Bot Configuration

```bash
# Verify environment variables are set
echo "DISCORD_TOKEN=${DISCORD_TOKEN:+***set***}"
echo "CLIENT_ID=$CLIENT_ID"
echo "GUILD_ID=$GUILD_ID"
```

---

## Step 6: Deploy Slash Commands

### For Development (Guild-Specific)

Faster deployment for testing:

```bash
# Deploy commands to your guild (requires GUILD_ID in .env)
npm run deploy
```

### For Production (Global)

Global deployment (takes up to 1 hour to propagate):

```bash
# Build production
npm run build

# Deploy commands globally (no GUILD_ID needed)
npm run deploy:commands
```

---

## Step 7: Start the Bot

### Development Mode (Auto-Restart on Changes)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

---

## Step 8: Test in Discord

### 1. Add Bot to Server

1. Go to Discord Developer Portal → Your Application
2. Go to "OAuth2" → "URL Generator"
3. Select scopes: `bot`
4. Select permissions: `Send Messages`, `Create Private Threads`, `Embed Links`, `Attach Files`, `Read Message History`
5. Copy generated URL and open in browser
6. Select your test server and authorize

### 2. Test Commands

In Discord server:

```
/raid list        # Should show "No raids scheduled"
/config timezone +1  # Set timezone
/raid create ...  # Create test raid
```

### 3. Check Logs

Bot logs appear in your terminal:

```
[INFO] Raid created: raid_id_123
[INFO] Embed sent to channel: #raids
```

---

## Troubleshooting

### Issue: "Cannot find module '@prisma/client'"

```bash
npm run db:generate
npm run build
```

See [[DATABASE-TROUBLESHOOTING]] for detailed solutions.

### Issue: "Bot won't start"

1. Check DISCORD_TOKEN is correct
2. Verify bot has permissions in test server
3. Check logs: `npm run dev` shows errors

Full troubleshooting: [[DATABASE-TROUBLESHOOTING]]

---

## Common Commands

```bash
# Development
npm run dev              # Start with auto-restart
npm run db:studio       # Browse database in web UI
npm run deploy          # Deploy commands to GUILD_ID
npm run test:jest       # Run tests

# Building
npm run build           # Compile TypeScript
npm run lint            # Type check only

# Database
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Create and run migrations
npm run db:migrate:deploy  # Run pending migrations

# Versioning
npm run version:patch   # 1.0.0 → 1.0.1
npm run version:minor   # 1.0.0 → 1.1.0
npm run version:major   # 1.0.0 → 2.0.0
```

---

## Next Steps

After successful setup:

1. **Read PLAYER-GUIDE.md** - Learn how players use the bot
2. **Read RAID-COMMAND.md** - Full `/raid` command reference
3. **Read CONFIG-COMMAND.md** - Full `/config` command reference
4. **Explore src/** - Review code structure
5. **Run tests** - Ensure environment is working: `npm run test:jest`

---

## Support & Troubleshooting

- **Database Issues?** → See [[DATABASE-TROUBLESHOOTING]]
- **Migration Issues?** → See [[DATABASE-MIGRATION-GUIDE]]
- **Version Info?** → See docs/VERSION.md
- **Report Bugs?** → https://github.com/anomalyco/RaidPresence/issues

---

## Environment Checklist

Before running, verify:

- [ ] Node.js 18+ installed
- [ ] .env file created with DISCORD_TOKEN and CLIENT_ID
- [ ] npm install completed successfully
- [ ] DATABASE_URL configured
- [ ] npm run db:migrate completed
- [ ] npm run deploy completed (commands registered)
- [ ] Bot added to Discord server
- [ ] `/raid list` command appears in Discord

If all checked, you're ready to go! Run `npm run dev` to start the bot.

---

**Last Updated:** 2026-02-18
**RaidPresence Version:** 0.1.0+
