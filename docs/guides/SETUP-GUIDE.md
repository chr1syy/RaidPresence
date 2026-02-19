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

Complete guide for installing and configuring RaidPresence Discord bot for local development and production deployment.

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18 or higher
- **npm** 8 or higher
- **Git** for cloning the repository
- **Discord Server** (for testing)
- **Discord Bot Application** (created at https://discord.dev/applications)
- **PostgreSQL** 12+ (for production) OR SQLite 3+ (for development - built in)

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
# Install all dependencies (also runs postinstall setup)
npm install

# The postinstall script will automatically:
# 1. Run switch-db (sets up SQLite for development)
# 2. Generate Prisma client
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

# Database Configuration (for development)
DB_ENV=dev
DATABASE_URL=""  # Empty for SQLite (uses ./prisma/dev.db)
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

### For Development (SQLite - Default)

SQLite is automatically configured by npm install. No extra setup needed!

```bash
# Verify SQLite is configured
echo $DB_ENV  # Should output: dev
grep "provider =" prisma/schema.prisma  # Should show: provider = "sqlite"

# Initialize database with migrations
npm run db:migrate dev --name init

# Verify database created
ls -la prisma/dev.db
```

### For Production (PostgreSQL)

If deploying to production:

```bash
# Set environment variables
export DB_ENV=prod
export DATABASE_URL="postgresql://user:password@host:port/dbname"

# Rebuild for PostgreSQL
npm run build

# Run migrations
npm run db:migrate:deploy
```

**Common PostgreSQL Hosts:**
- Railway.app: `postgresql://user:pass@container.railway.app:5432/railway`
- AWS RDS: `postgresql://user:pass@raidpresence.xxxx.us-east-1.rds.amazonaws.com:5432/raidpresence`
- Heroku: Already configured via `DATABASE_URL` config var

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

# Output should show:
# ✓ Switched to sqlite successfully
# ✓ Switched to sqlite successfully
# 0 | Bot is ready! Logged in as YourBotName#1234
# 0 | Successfully registered X commands
```

### Production Mode

```bash
npm start

# Runs: npm run switch-db && prisma migrate deploy && deploy-commands && node dist/index.js
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

## Database Configuration Details

### SQLite (Development)

**File Location:** `./prisma/dev.db`

**Configuration:**
```
DB_ENV=dev
DATABASE_URL=""  # Leave empty - defaults to ./prisma/dev.db
```

**Advantages:**
- Zero setup needed
- Perfect for local development
- File-based (backup via `cp`)

**Disadvantages:**
- No concurrent access (single file lock)
- Not suitable for production

### PostgreSQL (Production)

**Configuration:**
```
DB_ENV=prod
DATABASE_URL="postgresql://user:password@host:port/dbname"
```

**Connection String Format:**
```
postgresql://[user[:password]@][host][:port][/database][?param=value]

Examples:
postgresql://postgres:password@localhost:5432/raidpresence  # Local
postgresql://user:pass@db.railway.app:5432/railway          # Railway
postgresql://user:pass@raidpresence.xxxxx.rds.amazonaws.com:5432/raidpresence  # AWS RDS
```

**Setup on Railway.app (Recommended for Developers):**
1. Create Railway account: https://railway.app
2. Create new PostgreSQL database
3. Copy connection string from dashboard
4. Set as `DATABASE_URL` environment variable

---

## Troubleshooting

### Issue: "Cannot find module '@prisma/client'"

```bash
npm run db:generate
npm run build
```

See [[DATABASE-TROUBLESHOOTING]] for detailed solutions.

### Issue: "Database file not found"

```bash
npm run db:migrate dev --name init
```

### Issue: "Provider mismatch error"

```bash
npm run switch-db
npm run build
```

### Issue: "Bot won't start"

1. Check DISCORD_TOKEN is correct
2. Verify bot has permissions in test server
3. Check logs: `npm run dev` shows errors

Full troubleshooting: [[DATABASE-TROUBLESHOOTING]]

---

## Directory Structure After Setup

```
RaidPresence/
├── .env                   # Your configuration (git-ignored)
├── .env.example          # Example template
├── prisma/
│   ├── dev.db            # SQLite database (after first run)
│   ├── schema.prisma     # Database schema (auto-updated by switch-db)
│   └── migrations/       # Database migrations
├── src/
│   ├── index.ts          # Bot entry point
│   ├── commands/         # Slash commands
│   ├── events/           # Discord event handlers
│   ├── utils/            # Utility functions
│   └── database/
│       └── client.ts     # Prisma client
├── dist/                 # Compiled JavaScript (after npm build)
└── node_modules/         # Dependencies
```

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

## Migrating from PostgreSQL to SQLite

If you have existing PostgreSQL data:

```bash
# Export from PostgreSQL
export DATABASE_URL="postgresql://..."
export DB_ENV=prod

# Run export script
npx tsx scripts/export-postgres-to-sqlite.ts

# Your data is now in SQLite at ./prisma/dev.db
npm run dev
```

See [[DATABASE-MIGRATION-GUIDE]] for complete migration instructions.

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
- [ ] npm run db:migrate completed
- [ ] npm run deploy completed (commands registered)
- [ ] Bot added to Discord server
- [ ] `/raid list` command appears in Discord

If all checked, you're ready to go! Run `npm run dev` to start the bot.

---

**Last Updated:** 2026-02-18
**RaidPresence Version:** 0.1.0+
