# RaidPresence

[![CI/CD Pipeline](https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/chr1syy/RaidPresence/actions/workflows/ci-cd.yml)
[![Made with Maestro](https://github.com/pedramamini/Maestro/blob/main/docs/assets/made-with-maestro.svg)](https://github.com/pedramamini/Maestro)
[![Discord Server](https://img.shields.io/badge/discord-join%20us-5865F2?logo=discord&logoColor=white)](https://discord.com/invite/TxXfbY52fy)
[![Add Bot](https://img.shields.io/badge/discord-add%20bot-5865F2?logo=discord&logoColor=white)](https://discord.com/oauth2/authorize?client_id=1457999774224613489)
[![Homepage](https://img.shields.io/badge/homepage-raidpresence.dev-blue)](https://raidpresence.dev/)

A Discord bot for World of Warcraft raid attendance management with **reverse sign-up** system. Instead of requiring raiders to opt-in, everyone on the roster is automatically signed up and must opt-out if they can't attend.

## ✨ Features

### Core
- **Reverse Sign-Up System**: All eligible members automatically added to raid roster
- **Multi-Server Ready**: Per-server configuration stored in database
- **Role-Based Attendance**: Scan specific Discord roles to build attendance list
- **Role-Based Permissions**: Configure which roles can create and manage raids
- **Class/Spec Tracking**: Players can set and update their WoW class and specialization
- **Role Sorting**: Attendance list sorted by role (Tank → Healer → DPS)
- **User Preferences**: Remembers class/spec for future raids
- **Interactive UI**: Modern Discord buttons and select menus
- **Raid Management**: Create, list, edit, delete, close, cancel, and refresh raids
- **Real-time Updates**: Raid roster updates automatically as players respond
- **Multi-Language**: English and German localization with timezone support

### Raid Tools (Phase 1)
- **Raid Clone** (`/raid clone`): Quickly create a new raid from an existing one — copies roles, rescans members, fresh attendance
- **Attendance Stats** (`/raid stats`): Per-raid or guild-wide attendance analytics with reliability scoring and class distribution
- **Custom Reminders** (`/raid remind`): Send reminders with optional custom messages and opted-out player visibility
- **Status Dashboard** (`/raid status`): At-a-glance view of upcoming raids with roster fill and role breakdown

### Depth Features (Phase 2)
- **Player Attendance History** (`/raid attendance`): Track player reliability trends, response times, and role flexibility over 30/90 days or all-time
- **Composition Analysis** (`/raid suggest`): Analyze raid composition, identify gaps, and get specific player recommendations to fill roles
- **Raid Notes & Comments** (`/raid notes`): Collect opt-out reasons and player comments for better communication and planning
- **Raid Archive System** (`/raid pin`, `/raid unpin`, `/raid search`): Archive completed raids with searchable history and auto-archive configuration

## 📚 Documentation

### Quick Links

- **[📖 Setup Guide](docs/guides/SETUP-GUIDE.md)** - Installation and initial configuration
- **[👥 Player Guide](docs/guides/PLAYER-GUIDE.md)** - How players interact with raids
- **[⚔️ /raid Commands](docs/commands/RAID-COMMAND.md)** - Creating and managing raids
- **[⚙️ /config Commands](docs/commands/CONFIG-COMMAND.md)** - Server configuration

### Additional Resources

- **[🆕 Phase 1 Features](docs/features/phase1-features.md)** - Clone, Stats, Reminders, Status Dashboard
- **[🚀 Phase 2 Features](docs/features/phase2-features.md)** - Attendance History, Composition Analysis, Raid Notes, Archive System
- **[🐛 Troubleshooting Guide](TROUBLESHOOTING.md)** - Common issues and solutions
- **[💪 Contributing Guide](CONTRIBUTING.md)** - How to contribute to the project
- **[🗺️ Roadmap](ROADMAP.md)** - Future development plans
- **[📋 License](LICENSE)** - Custom Business Source License (CBSL)

## 🚀 Quick Start

1. **Clone & Install**
   ```bash
   git clone https://github.com/chr1syy/RaidPresence.git
   cd RaidPresence
   npm install
   ```

2. **Create Discord Bot** ([Step-by-step guide](docs/guides/SETUP-GUIDE.md#discord-bot-creation))
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application and bot
   - Copy your bot token and client ID

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot token
   ```

4. **Setup Database**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

5. **Deploy Commands**
   ```bash
   npm run deploy
   ```

6. **Start the Bot**
   ```bash
   npm run dev        # Development (auto-restart on changes)
   npm start          # Production
   ```

7. **Configure Server** (In Discord)
   ```
   /config raid-roles roles:Raider,Member
   /config leader-roles roles:Officer
   /config timezone offset:0
   ```

For detailed setup instructions, see **[📖 Setup Guide](docs/guides/SETUP-GUIDE.md)**.

## 🛠️ Technology Stack

- **TypeScript** - Type-safe development
- **discord.js v14** - Discord API wrapper with sharding support
- **Prisma** - Type-safe database ORM
- **PostgreSQL** - Production database (SQLite for local dev)

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Discord Bot Token ([Create one here](https://discord.com/developers/applications))
- PostgreSQL database (production) or SQLite (local development)

## 💬 Support

Having issues? Check the [🐛 Troubleshooting Guide](TROUBLESHOOTING.md) for common problems and solutions.

Want to contribute? See [💪 Contributing Guide](CONTRIBUTING.md) for guidelines.

Need help? Ask in our [Discord community](https://discord.com/invite/TxXfbY52fy).

## 📁 Project Structure

```
RaidPresence/
├── docs/
│   ├── commands/
│   │   ├── RAID-COMMAND.md      # /raid command reference
│   │   └── CONFIG-COMMAND.md    # /config command reference
│   ├── features/
│   │   └── phase1-features.md   # Phase 1 feature docs
│   └── guides/
│       ├── SETUP-GUIDE.md       # Installation & setup
│       └── PLAYER-GUIDE.md      # Player interaction guide
├── prisma/
│   └── schema.prisma            # Database schema
├── src/
│   ├── commands/                # Slash command implementations
│   ├── database/                # Prisma client
│   ├── events/                  # Event handlers
│   ├── types/                   # TypeScript types
│   ├── utils/                   # Utility functions
│   ├── deploy-commands.ts       # Command deployment
│   └── index.ts                 # Bot entry point
├── .env.example                 # Environment template
├── package.json                 # Dependencies
└── tsconfig.json               # TypeScript config
```

## 📄 License

This project is licensed under a **Custom Business Source License (CBSL)** based on BUSL-1.1.

- ✅ **Allowed**: Non-commercial use, modification, and distribution
- ❌ **Restricted**: Commercial sale or commercial services (permanently, no automatic change clause)
- 📧 **Commercial Use**: Contact chr1syy for explicit permission

See [LICENSE](LICENSE) for full details.

---

## 🎯 Next Steps

- **New to RaidPresence?** Start with the [📖 Setup Guide](docs/guides/SETUP-GUIDE.md)
- **Managing a raid?** See the [⚔️ /raid Commands](docs/commands/RAID-COMMAND.md) guide
- **Configuring your server?** Check the [⚙️ /config Commands](docs/commands/CONFIG-COMMAND.md) guide
- **Playing in a raid?** Read the [👥 Player Guide](docs/guides/PLAYER-GUIDE.md)

**Questions? Issues? Feedback?** [Open an issue](https://github.com/chr1syy/RaidPresence/issues) or [join our Discord](https://discord.com/invite/TxXfbY52fy).
