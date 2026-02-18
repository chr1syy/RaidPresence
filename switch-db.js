/**
 * Database Provider Switcher - Enables SQLite (dev) / PostgreSQL (prod)
 *
 * This script dynamically modifies prisma/schema.prisma to switch between
 * database providers based on the DB_ENV environment variable.
 *
 * USAGE:
 *   - Automatically runs on: npm install (postinstall hook), before each npm command
 *   - Manual trigger: npm run switch-db
 *   - Set DB_ENV=dev for SQLite (local development, default)
 *   - Set DB_ENV=prod for PostgreSQL (production deployment)
 *
 * WHY THIS APPROACH:
 *   - Prisma requires the provider to be specified in schema.prisma at generation time
 *   - Different environments need different database systems:
 *     * Development: SQLite for zero-config local testing (prisma/dev.db)
 *     * Production: PostgreSQL for scalability and cloud hosting
 *   - This script rewrites the schema before Prisma client generation
 *
 * HOW TO VERIFY ACTIVE PROVIDER:
 *   1. Check environment: echo $DB_ENV
 *   2. Check schema: grep "provider =" prisma/schema.prisma
 *   3. Check DATABASE_URL:
 *      - Dev (SQLite): echo $DATABASE_URL (should be empty or file path)
 *      - Prod (PostgreSQL): echo $DATABASE_URL (should be postgresql://...)
 *   4. Regenerate client: npm run db:generate
 *
 * WORKFLOW:
 *   1. Read current prisma/schema.prisma
 *   2. Locate datasource db { ... } block using regex pattern
 *   3. Replace entire datasource block with appropriate provider and URL source
 *   4. Write modified schema back to disk
 *   5. Prisma client is then generated with correct provider
 *
 * ERROR HANDLING:
 *   - If datasource block not found in schema → exits with code 1
 *   - If provider not successfully updated → exits with code 1
 *   - Failures are logged to console with ✗ prefix
 *
 * IMPORTANT NOTES:
 *   - Do NOT commit prisma/schema.prisma with SQLite provider to main branch
 *   - Do NOT commit DATABASE_URL secrets to version control (use .env.local)
 *   - Development environment should have DB_ENV=dev in .env or shell session
 *   - Production CI/CD should set DB_ENV=prod and DATABASE_URL via secrets
 */

const fs = require('fs');
const path = require('path');

const dbEnv = process.env.DB_ENV || 'dev';
const provider = dbEnv === 'prod' ? 'postgresql' : 'sqlite';
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');

console.log(`Switching database provider to ${provider} for ${dbEnv}`);

try {
  let schema = fs.readFileSync(schemaPath, 'utf-8');

  // More robust pattern that handles various formatting
  const datasourcePattern = /datasource\s+db\s*\{[^}]*provider\s*=\s*"[^"]*"[^}]*\}/s;
  
  if (!datasourcePattern.test(schema)) {
    throw new Error('Could not find datasource block in schema.prisma');
  }

  // Replace entire datasource block
  const newDatasource = dbEnv === 'prod' 
    ? `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`
    : `datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

  schema = schema.replace(datasourcePattern, newDatasource);

  // Validate replacement worked
  if (!schema.includes(`provider = "${provider}"`)) {
    throw new Error(`Failed to set database provider to ${provider}`);
  }

  fs.writeFileSync(schemaPath, schema);
  console.log(`✓ Switched to ${provider} successfully`);
} catch (error) {
  console.error(`✗ Failed to switch database provider: ${error.message}`);
  process.exit(1);
}
