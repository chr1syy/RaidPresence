# RaidPresence

A Discord bot for World of Warcraft raid attendance management with **reverse sign-up** system. Instead of requiring raiders to opt-in, everyone on the roster is automatically signed up and must opt-out if they can't attend.

## Features

- **Reverse Sign-Up System**: All eligible members are automatically added to raid roster
- **Multi-Server Ready**: Per-server configuration stored in database - ready for public deployment
- **Role-Based Attendance**: Scan specific Discord roles to build attendance list
- **Role-Based Permissions**: Configure which roles can create and manage raids
- **Class/Spec Tracking**: Players can set and update their WoW class and specialization
- **Role Sorting**: Attendance list sorted by role (Tank → Healer → DPS)
- **User Preferences**: Remembers class/spec for future raids
- **Interactive UI**: Modern Discord buttons and select menus
- **Raid Management**: List, delete, and track all raids
- **Real-time Updates**: Raid roster updates automatically as players respond

## 🚀 Quick Deploy to Railway (Free!)

**Ready to deploy in 10 minutes?** See **[QUICKSTART_RAILWAY.md](QUICKSTART_RAILWAY.md)**

1. Push code to GitHub
2. Connect to Railway.app (free tier)
3. Add PostgreSQL database
4. Set environment variables
5. Bot goes live! ✅

Cost: **FREE for small bots** ($5/month credit included)

---

## Technology Stack

- **TypeScript** - Type-safe development
- **discord.js v14** - Discord API wrapper with sharding support
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Production database (SQLite for local dev)

## Prerequisites

- Node.js 18+
- npm or yarn
- Discord Bot Token ([Create one here](https://discord.com/developers/applications))

## Setup

### 1. Clone and Install

```bash
cd /var/www/RaidPresence
npm install
```

### 2. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Under "Token", click "Reset Token" and copy it
5. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent (if needed later)
6. Go to "OAuth2" → "General"
   - Copy your Client ID
7. Go to "OAuth2" → "URL Generator"
   - Scopes: Select `bot` and `applications.commands`
   - Bot Permissions: Select:
     - Send Messages
     - Embed Links
     - Read Message History
     - Use Slash Commands
     - Manage Events
   - Copy the generated URL and use it to invite the bot to your server

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` file:

```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DATABASE_URL="file:./dev.db"
RAID_ROLES=role_name_or_id,another_role
```

**RAID_ROLES**: Comma-separated list of Discord role names or IDs. Members with these roles will be automatically added to raids.

### 4. Setup Database

```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate
```

### 5. Deploy Commands to Discord

```bash
npm run deploy
```

This registers the slash commands with Discord.

### 6. Start the Bot

Development mode (auto-restart on changes):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## Configuration

### First-Time Server Setup

Each server admin needs to configure the bot for their server using the `/config` commands:

#### 1. View Current Configuration

```
/config view
```

Shows your server's current settings for raid roles and leader roles.

#### 2. Set Raid Attendance Roles

```
/config raid-roles roles:Raider,Member,Trial
```

Members with these roles will be automatically added to raid rosters. You can use:
- Role names (e.g., `Raider,Member`)
- Role IDs (e.g., `123456789,987654321`)
- Mix of both

**Important:** Role names are case-sensitive!

#### 3. Set Raid Leader Roles

```
/config leader-roles roles:Officer,Raid Leader
```

Members with these roles can create and manage raids. If not configured, defaults to anyone with ManageEvents permission.

### Multi-Server Support

The bot stores configuration **per-server** in the database. Each Discord server can have completely different settings:
- Server A: Raid roles = "Raider,Member"
- Server B: Raid roles = "Guild Member,Core Raider,Trial"

No need to restart the bot or edit configuration files!

## Usage

### Creating a Raid

Use the slash command in any channel:

```
/raid create date:2026-01-15 time:20:00 title:Heroic Raid Night
```

**Parameters:**
- `date`: Format YYYY-MM-DD
- `time`: 24-hour format HH:MM
- `title`: Raid title/name (required)

**Permissions:** Requires configured raid leader role or ManageEvents permission.

The bot will:
1. Scan for all members with configured raid roles
2. Create an attendance list with everyone marked as "attending"
3. Pull saved class/spec preferences for each member
4. Post a public interactive raid message with buttons
5. Send you a private confirmation message

### Listing Raids

View all upcoming raids:

```
/raid list
```

Shows all future raids with:
- Raid title and date
- Attendance count (attending/total)
- Raid ID for management

### Deleting a Raid

Delete a raid event:

```
/raid delete raid_id:xyz123
```

**Permissions:** Requires configured raid leader role or ManageEvents permission.

This will:
- Delete the raid message from the channel
- Remove all attendance records
- Delete the raid from the database

### Managing Attendance

Players can interact with the raid message using buttons:

- **Opt Out**: Remove yourself from the raid
- **Opt In**: Re-join the raid if you opted out
- **Set Class/Spec**: Select your WoW class and specialization

### Class/Spec Selection

When clicking "Set Class/Spec":
1. Select your WoW class from dropdown
2. Select your specialization
3. Your preference is saved for all future raids
4. Attendance list automatically updates and sorts by role (Tank → Healer → DPS)
5. Can be changed anytime

### Raid Display

The raid message shows:
- **Title**: Your custom raid title
- **Date & Time**: Discord timestamp (displays in user's timezone)
- **Composition**: Role breakdown (Tanks: X • Healers: Y • DPS: Z)
- **Attending**: Sorted by role - Tanks first, then Healers, then DPS
- **Opted Out**: List of players who can't attend

## Database Schema

### Models

- **Guild**: Server settings and raid role configuration
- **UserPreference**: Saved class/spec preferences per user per guild
- **Raid**: Raid event details
- **RaidAttendance**: Tracks who's attending each raid

## Project Structure

```
RaidPresence/
├── prisma/
│   └── schema.prisma        # Database schema
├── src/
│   ├── commands/
│   │   ├── raid.ts          # /raid command (create, list, delete)
│   │   └── config.ts        # /config command (server settings)
│   ├── database/
│   │   └── client.ts        # Prisma client instance
│   ├── events/
│   │   ├── buttonHandler.ts # Button interaction handler
│   │   └── selectHandler.ts # Select menu handler
│   ├── types/
│   │   └── index.ts         # TypeScript types
│   ├── utils/
│   │   ├── wowData.ts       # WoW class/spec data
│   │   └── permissions.ts   # Permission checking
│   ├── deploy-commands.ts   # Deploy slash commands
│   └── index.ts             # Bot entry point
├── .env                     # Environment configuration
├── package.json
└── tsconfig.json
```

## Development

### Database Management

View database in browser:
```bash
npm run db:studio
```

Create new migration:
```bash
npm run db:migrate
```

### Adding New Commands

1. Create command file in `src/commands/`
2. Import and register in `src/index.ts`
3. Run `npm run deploy` to update Discord

## Deploying as a Public Bot

The bot is fully ready for multi-server deployment! Here's how:

### 1. Use PostgreSQL for Production

For multiple servers, switch from SQLite to PostgreSQL:

```bash
# Update .env
DATABASE_URL="postgresql://user:password@host:5432/raidpresence"

# Run migration
npm run db:migrate
```

### 2. Host on Cloud Platform

Deploy to:
- **Railway**: Easy deployment with PostgreSQL addon
- **Heroku**: Free tier with Heroku Postgres
- **DigitalOcean**: App Platform with managed PostgreSQL
- **VPS**: Self-hosted with Docker

### 3. Public Bot Invite Link

After deploying, create an invite link:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2147502080&scope=bot%20applications.commands
```

Required permissions:
- Send Messages
- Embed Links
- Read Message History
- Use Slash Commands
- Manage Events
- Read Members (for role scanning)

### 4. Server Admin Instructions

Point server admins to run these commands after inviting:
```
/config raid-roles roles:YourRoles
/config leader-roles roles:YourLeaderRoles
```

Each server configures independently!

## Roadmap

### Phase 2 (Near Future)
- [ ] Copy roster from previous raid (`/raid clone`)
- [ ] Manual roster management (`/raid add`, `/raid remove`)
- [ ] Raid status (Planning, Open, Locked, Completed)
- [ ] Automated reminders
- [ ] Export roster to text format
- [ ] Raid history and statistics

### Phase 3 (Scaling)
- [x] Multi-server support with per-guild config
- [ ] Sharding for large-scale deployment
- [ ] PostgreSQL migration
- [ ] Web dashboard for raid management
- [ ] Calendar integration
- [ ] Guild analytics

### Phase 4 (Monetization)
- [ ] Premium features (web interface, advanced stats)
- [ ] Support for other games
- [ ] Custom raid templates
- [ ] Automated roster optimization

## Troubleshooting

**Bot not responding to commands:**
- Verify bot token in `.env`
- Check bot has necessary permissions
- Ensure commands were deployed: `npm run deploy`
- Check bot is online in Discord

**No one added to raid:**
- Verify `RAID_ROLES` in `.env` matches your Discord role names or IDs
- Check bot has "Server Members Intent" enabled
- Ensure bot can see members (may need to fetch members)

**Database errors:**
- Run `npm run db:generate` after schema changes
- Run `npm run db:migrate` to apply migrations

## Contributing

This is a personal project in active development. Contributions, ideas, and feedback are welcome!

## License

MIT
