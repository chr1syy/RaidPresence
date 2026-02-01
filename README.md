# RaidPresence

[![CI/CD Pipeline](https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml)

A Discord bot for World of Warcraft raid attendance management with **reverse sign-up** system. Instead of requiring raiders to opt-in, everyone on the roster is automatically signed up and must opt-out if they can't attend.

## Features

- **Reverse Sign-Up System**: All eligible members are automatically added to raid roster
- **Multi-Server Ready**: Per-server configuration stored in database
- **Role-Based Attendance**: Scan specific Discord roles to build attendance list
- **Role-Based Permissions**: Configure which roles can create and manage raids
- **Class/Spec Tracking**: Players can set and update their WoW class and specialization
- **Role Sorting**: Attendance list sorted by role (Tank → Healer → DPS)
- **User Preferences**: Remembers class/spec for future raids
- **Interactive UI**: Modern Discord buttons and select menus
- **Raid Management**: List, delete, and track all raids
- **Real-time Updates**: Raid roster updates automatically as players respond

## Documentation

- **[CI/CD Badges](CI-BADGES.md)** - Repository build status badges
- **[Troubleshooting Guide](TROUBLESHOOTING.md)** - Common issues and solutions
- **[Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project
- **[Roadmap](ROADMAP.md)** - Future development plans
- **[License](LICENSE)** - MIT License

## Technology Stack

- **TypeScript** - Type-safe development
- **discord.js v14** - Discord API wrapper with sharding support
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Production database (SQLite for local dev)

## Prerequisites

- Node.js 18+
- npm or yarn
- Discord Bot Token ([Create one here](https://discord.com/developers/applications))
- PostgreSQL database (production) or SQLite (local development)

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/RaidPresence.git
cd RaidPresence
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
```

For local development, SQLite is used by default. For production deployment, use PostgreSQL.

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

## Slash Commands Reference

### `/raid` Command

Main command for creating and managing raid events.

#### `/raid create`

Create a new raid event with automatic roster population.

**Syntax:**
```
/raid create date:YYYY-MM-DD time:HH:MM title:Raid Title [roles:Role1,Role2]
```

**Parameters:**
- `date` *(required)*: Raid date in format YYYY-MM-DD (e.g., 2026-01-15)
- `time` *(required)*: Raid time in 24-hour format HH:MM (e.g., 20:00)
- `title` *(required)*: Custom name for the raid event
- `roles` *(optional)*: Custom Discord roles for this raid (comma-separated role names or IDs). If not specified, uses guild's default raid roles.
- `ping_roles` *(optional)*: Whether to mention the roles when creating the raid (default: false)

**Examples:**
```
/raid create date:2026-01-15 time:20:00 title:Heroic Raid Night
/raid create date:2026-01-20 time:19:30 title:Mythic Progress roles:CoreRaider,Trial
/raid create date:2026-01-22 time:20:00 title:Alt Run roles:Member ping_roles:true
```

**Permissions:** Requires configured raid leader role or ManageEvents permission.

**Behavior:**
- Uses guild's default raid roles (configured via `/config raid-roles`) unless the `roles` parameter is specified
- When `roles` parameter is provided: Uses those custom roles for this specific raid instead of guild defaults
- Creates an attendance list with all eligible members automatically marked as "attending"
- Pulls saved class/spec preferences for each member
- Posts an interactive raid message with buttons in the channel
- Optionally mentions the configured roles if `ping_roles` is set to true
- Sends a private confirmation message to the creator

#### `/raid list`

View all upcoming raids for the server.

**Syntax:**
```
/raid list
```

**Shows:**
- Raid title and date/time
- Attendance count (attending/total roster)
- Raid ID for use with management commands
- All raids sorted by date

#### `/raid delete`

Permanently delete a raid event.

**Syntax:**
```
/raid delete raid_id:xyz123
```

**Parameters:**
- `raid_id` *(required)*: The unique ID of the raid (shown in `/raid list`)

**Permissions:** Requires configured raid leader role or ManageEvents permission.

**Effects:**
- Deletes the raid message from the channel
- Removes all attendance records from database
- Permanently deletes the raid event

#### `/raid close`

Close a raid to prevent further attendance changes.

**Syntax:**
```
/raid close raid_id:xyz123
```

**Parameters:**
- `raid_id` *(required)*: The unique ID of the raid

**Permissions:** Requires configured raid leader role or ManageEvents permission.

**Effects:**
- Disables all interactive buttons on the raid message
- Prevents players from changing attendance status
- Locks the roster for final planning

#### `/raid cancel`

Cancel a raid event and notify attendees.

**Syntax:**
```
/raid cancel raid_id:xyz123
```

**Parameters:**
- `raid_id` *(required)*: The unique ID of the raid

**Permissions:** Requires configured raid leader role or ManageEvents permission.

**Effects:**
- Marks the raid as cancelled in the embed
- Keeps the raid message visible but indicates cancellation status
- Maintains attendance records for reference

#### `/raid remind`

Send a reminder message for an upcoming raid.

**Syntax:**
```
/raid remind raid_id:xyz123
```

**Parameters:**
- `raid_id` *(required)*: The unique ID of the raid

**Permissions:** Requires configured raid leader role or ManageEvents permission.

**Effects:**
- Posts a reminder message in the channel
- Mentions the raid's configured roles (not individual members)
- Shows raid details (date, time, title)

#### `/raid refresh`

Refresh raid roster by re-scanning members and updating the embed.

**Syntax:**
```
/raid refresh raid_id:xyz123
```

**Parameters:**
- `raid_id` *(required)*: The unique ID of the raid

**Permissions:** Requires configured raid leader role or ManageEvents permission.

**Use Cases:**
- Add members who gained raid role after raid creation
- Remove members who lost raid role
- Update embed with latest design/layout changes
- Refresh roster after role changes

**Effects:**
- Re-scans all eligible members based on current raid roles
- Adds new members who now have raid role
- Removes members who no longer have raid role
- Updates the raid embed message with latest design
- Shows count of members added/removed

### `/config` Command

Configure bot settings for your Discord server. Each server has independent configuration.

**Permissions:** All `/config` commands require Administrator permission.

#### `/config view`

View current server configuration.

**Syntax:**
```
/config view
```

**Shows:**
- Raid attendance roles (for auto-roster)
- Raid leader roles (for permissions)
- Bot language setting
- Timezone setting

#### `/config raid-roles`

Set Discord roles that are automatically added to raid rosters.

**Syntax:**
```
/config raid-roles roles:Role1,Role2,Role3
```

**Parameters:**
- `roles` *(required)*: Comma-separated role names or IDs

**Examples:**
```
/config raid-roles roles:Raider,Member,Trial
/config raid-roles roles:123456789,987654321
```

**Notes:**
- Role names are case-sensitive
- Can use role names, role IDs, or a mix
- These roles serve as the default for new raids when the `roles` parameter is not specified in `/raid create`
- Individual raids can override these defaults by specifying custom roles in the `/raid create` command
- The `/raid refresh` command uses the raid's configured roles (custom or defaults) to update the roster

#### `/config leader-roles`

Set Discord roles that can create and manage raids.

**Syntax:**
```
/config leader-roles roles:Officer,Raid Leader
```

**Parameters:**
- `roles` *(required)*: Comma-separated role names or IDs

**Examples:**
```
/config leader-roles roles:Officer,Raid Leader
/config leader-roles roles:123456789
```

**Notes:**
- Members with these roles can use all `/raid` management commands
- If not configured, defaults to members with ManageEvents permission
- Role names are case-sensitive

#### `/config language`

Set the bot language for your server.

**Syntax:**
```
/config language lang:en
```

**Parameters:**
- `lang` *(required)*: Language code (en = English, de = German (Deutsch))

**Available Languages:**
- `en`: English
- `de`: German (Deutsch)

**Effects:**
- All bot messages will appear in the selected language
- Raid embeds, buttons, and responses are translated

#### `/config timezone`

Set timezone offset for raid times.

**Syntax:**
```
/config timezone offset:1
```

**Parameters:**
- `offset` *(required)*: Timezone offset in hours (range: -12 to +14)

**Examples:**
```
/config timezone offset:0    # GMT/UTC
/config timezone offset:1    # GMT+1 (CET)
/config timezone offset:-5   # GMT-5 (EST)
/config timezone offset:8    # GMT+8 (CST/PHT)
```

**Effects:**
- Raid times will be created using this timezone
- Discord timestamps still display in each user's local timezone

## Player Interactions

### Managing Attendance

Players can interact with the raid message using interactive buttons:

**Available Buttons:**
- **Opt Out**: Remove yourself from the raid roster if you cannot attend
- **Opt In**: Re-join the raid if you previously opted out
- **Running Late**: Mark yourself as late while remaining on the roster
- **Set Class/Spec**: Select your WoW class and specialization

All changes are instant and update the raid embed in real-time.

### Class/Spec Selection

When clicking the "Set Class/Spec" button:

1. **Select Class**: Choose your WoW class from the dropdown menu
2. **Select Spec**: Choose your active specialization
3. **Auto-Save**: Your preference is saved to your user profile
4. **Auto-Update**: The raid embed immediately updates with your spec symbol and correct role
5. **Auto-Sort**: You're automatically sorted into the correct role column (Tank/Healer/DPS)
6. **Persistent**: Your class/spec is remembered for all future raids
7. **Flexible**: Change your spec anytime by clicking the button again

### Raid Embed Display

The raid embed shows a clean, organized 3-column layout:

**Header:**
- Raid title (customizable)
- Date & time (Discord timestamp - displays in each user's local timezone)
- Role composition summary (Tanks: X • Healers: Y • DPS: Z)

**Main Columns (3-column layout):**
- **🛡️ Tanks**: Left column with tank count and player list
- **💚 Healers**: Middle column with healer count and player list  
- **⚔️ DPS**: Right column with combined Melee + Ranged DPS count and player list

Each player name includes their spec symbol (e.g., ⚔️ for Arms Warrior, 🛡️ for Protection Paladin).

**Special Sections (below main columns):**
- **⏰ Running Late**: Players who marked themselves as running late
- **❌ Opted Out**: Players who cannot attend
- **❓ No Class**: Players who haven't set their class/spec yet

All sections show player count and sorted player names.

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

For more details, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Support

Having issues? Check out the [Troubleshooting Guide](TROUBLESHOOTING.md) for common problems and solutions.

## Contributing

Contributions, ideas, and feedback are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - see [LICENSE](LICENSE) for details.
