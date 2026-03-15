#!/bin/sh
set -e

# Configure Prisma for PostgreSQL
DB_ENV=prod node switch-db.js

# Apply pending database migrations
npx prisma migrate deploy

# Register Discord slash commands
node dist/deploy-commands.js

# Start the bot (exec so Node receives signals)
exec node dist/index.js
