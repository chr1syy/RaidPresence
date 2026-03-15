#!/bin/sh
set -e

# Apply pending database migrations
npx prisma migrate deploy

# Register Discord slash commands
node dist/deploy-commands.js

# Start the bot (exec so Node receives signals)
exec node dist/index.js
