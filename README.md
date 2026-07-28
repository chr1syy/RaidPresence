# RaidPresence

Discord bot for WoW raid attendance management with reverse sign-up.

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd raid-presence
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in your values.

4. Build the project:
   ```bash
   npm run build
   ```

## Commands

| Command | Subcommands | Description |
| --- | --- | --- |
| `/raid` | `create`, `list`, `edit`, `delete`, `clone`, `close`, `open`, `cancel`, `remind`, `refresh`, `archive`, `unarchive`, `search` | Raid lifecycle and archiving |
| `/team` | `create`, `list`, `delete` | Manage raid teams — one team per server on the free tier, unlimited with Premium |
| `/stats` | `raid`, `guild`, `status`, `attendance`, `suggest` | Statistics and analytics |
| `/config` | `view`, `leader-roles`, `timezone`, `language`, `archive-channel`, `auto-archive` | Server configuration |
| `/setup` | – | Interactive server setup wizard |

Every server starts with one default team. Commands that span multiple raids
(`/raid create|list|clone|search`, `/stats guild|status|attendance`) take an optional
`team:<name>` option and fall back to the default team when it is omitted.

## Documentation

For detailed usage instructions and command references:

- **[Raid Commands](/docs/commands/RAID-COMMAND.md)** - Complete guide to `/raid` subcommands
- **[Configuration Commands](/docs/commands/CONFIG-COMMAND.md)** - Server setup and configuration options

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm run start
```

### Database Migration
```bash
npm run db:migrate:deploy
```

### Deploy Commands
```bash
npm run deploy:commands
```

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

This project is licensed under the [RaidPresence Custom Business Source License (CBSL) 1.1](LICENSE).