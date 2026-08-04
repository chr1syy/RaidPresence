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

### Extending Running Trials

One-off data correction that moves already-running Premium trials onto the current
`TRIAL_DAYS` length. Dry-run is the default; nothing is written without `--apply`.

```bash
npm run trials:extend            # dry run — prints the plan, writes nothing
npm run trials:extend -- --apply # writes the recomputed expiries
```

**Run it after a clean entitlement sync, in a quiet window.** The script skips paying
guilds via `entitlementId = null`, and re-asserts that predicate in the WHERE clause of
every write — but that check can only see what the entitlement sync has already written
to the database. A guild whose payment lands at Discord *during* the run, before the sync
has stamped its `entitlementId` locally, still looks like a plain trial to both the scan
and the write. The window is small and the damage is limited to one overwritten
`premiumExpiresAt`, which the next entitlement sync corrects — but waiting for a clean
sync and picking a low-traffic window removes it. The script is idempotent (expiry is
recomputed from `trialStartedAt`), so a re-run after the sync is always safe.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

This project is licensed under the [RaidPresence Custom Business Source License (CBSL) 1.1](LICENSE).