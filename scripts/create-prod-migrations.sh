#!/usr/bin/env bash

# Production Migration Helper
# Ensures you have the right DATABASE_URL before generating migrations

set -e

echo "🚀 Production Migration Generator"
echo "================================="
echo ""

# Check if DATABASE_URL is set and looks like PostgreSQL
if [[ -z "$DATABASE_URL" ]]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set!"
    echo ""
    echo "Set it to your production PostgreSQL URL:"
    echo "export DATABASE_URL='postgresql://username:password@host:5432/dbname'"
    echo ""
    exit 1
fi

if [[ "$DATABASE_URL" == file:* ]]; then
    echo "❌ ERROR: DATABASE_URL points to SQLite file, but we need PostgreSQL!"
    echo ""
    echo "For production migrations, set DATABASE_URL to your PostgreSQL connection:"
    echo "export DATABASE_URL='postgresql://username:password@host:5432/dbname'"
    echo ""
    exit 1
fi

if [[ "$DATABASE_URL" != postgresql://* && "$DATABASE_URL" != postgres://* ]]; then
    echo "❌ ERROR: DATABASE_URL doesn't look like a PostgreSQL URL!"
    echo ""
    echo "Expected format: postgresql://username:password@host:5432/dbname"
    echo "Current value: $DATABASE_URL"
    echo ""
    exit 1
fi

echo "✅ DATABASE_URL looks good: ${DATABASE_URL%%@*}@[HIDDEN]"
echo ""
echo "Generating PostgreSQL migrations..."
echo ""

# Run the actual migration generation
npm run db:create-migrations

echo ""
echo "✅ Success! PostgreSQL migrations created in prisma/migrations/"
echo ""
echo "Next steps:"
echo "1. Review the generated migration files"
echo "2. Commit them: git add prisma/migrations/"
echo "3. Push to main: git push origin main"
echo "4. Deploy to production (migrations run automatically)"
echo ""