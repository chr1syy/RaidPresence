/**
 * Database Provider Switcher - Enables SQLite (dev) / PostgreSQL (prod)
 * With separate migration directories for each provider
 *
 * USAGE:
 *   - Set DB_ENV=dev for SQLite (local development, default)
 *   - Set DB_ENV=prod for PostgreSQL (production deployment)
 *
 * WORKFLOW:
 *   1. Read current prisma/schema.prisma
 *   2. Switch provider (sqlite ↔ postgresql)
 *   3. Switch migration directory (migrations-dev ↔ migrations-prod)
 *   4. Prisma uses correct migrations for that provider
 *
 * MIGRATION DIRECTORIES:
 *   - prisma/migrations-dev/   → SQLite migrations (local testing)
 *   - prisma/migrations-prod/  → PostgreSQL migrations (production)
 *   - prisma/migrations/       → symlink to active directory
 *
 * KEY INSIGHT:
 *   Each provider has its own migration history because:
 *   - SQLite uses different SQL syntax than PostgreSQL
 *   - migration_lock.toml locks to one provider at a time
 *   - Switching providers requires switching migration sets
 */

const fs = require('fs');
const path = require('path');

const dbEnv = process.env.DB_ENV || 'dev';
const provider = dbEnv === 'prod' ? 'postgresql' : 'sqlite';
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
const migrationsPath = path.join(__dirname, 'prisma', 'migrations');
const migrationsDev = path.join(__dirname, 'prisma', 'migrations-dev');
const migrationsProd = path.join(__dirname, 'prisma', 'migrations-prod');
const targetMigrationsDir = dbEnv === 'prod' ? migrationsProd : migrationsDev;

// In CI we only need prisma generate (for types). Skip migration directory
// setup entirely — symlinks to non-existent paths cause ENOENT failures.
const isCI = process.env.CI === 'true' || process.env.CI === '1';

try {
  // 1. Switch schema provider
  let schema = fs.readFileSync(schemaPath, 'utf-8');
  const datasourcePattern = /datasource\s+db\s*\{[^}]*provider\s*=\s*"[^"]*"[^}]*\}/s;

  if (!datasourcePattern.test(schema)) {
    throw new Error('Could not find datasource block in schema.prisma');
  }

  let newDatasource;
  if (dbEnv === 'prod') {
    newDatasource = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`;
  } else {
    const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db';
    newDatasource = `datasource db {
  provider = "sqlite"
  url      = "${databaseUrl}"
}`;
  }

  schema = schema.replace(datasourcePattern, newDatasource);

  if (!schema.includes(`provider = "${provider}"`)) {
    throw new Error(`Failed to set database provider to ${provider}`);
  }

  fs.writeFileSync(schemaPath, schema);
  console.log(`Switching database provider to ${provider} for ${dbEnv}`);
  console.log(`✓ Switched to ${provider} successfully`);

  if (isCI) {
    console.log(`  CI environment — skipping migration directory setup`);
    process.exit(0);
  }

  // 2. Ensure target migrations directory exists
  if (!fs.existsSync(targetMigrationsDir)) {
    fs.mkdirSync(targetMigrationsDir, { recursive: true });
    console.log(`✓ Created ${dbEnv} migrations directory`);
  }

  // 3. Switch migrations symlink/directory
  // Use lstatSync (does NOT follow symlinks) so we correctly detect and remove
  // broken symlinks (e.g. leftover absolute paths from other machines).
  try {
    const stat = fs.lstatSync(migrationsPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(migrationsPath);
    } else if (stat.isDirectory()) {
      fs.rmSync(migrationsPath, { recursive: true });
    }
  } catch (e) {
    // Path does not exist — nothing to remove
  }

  // Use a relative symlink so it works across machines and in any checkout
  const relativeTarget = path.relative(path.dirname(migrationsPath), targetMigrationsDir);

  try {
    const isWin = process.platform === 'win32';
    if (isWin) {
      fs.symlinkSync(targetMigrationsDir, migrationsPath, 'junction');
    } else {
      fs.symlinkSync(relativeTarget, migrationsPath);
    }
    console.log(`✓ Linked migrations/ → ${relativeTarget}`);
  } catch (symlinkErr) {
    // Fallback: copy directory contents
    console.log(`⚠ Symlink failed (${symlinkErr.code}), copying migration files instead`);
    fs.mkdirSync(migrationsPath, { recursive: true });
    for (const file of fs.readdirSync(targetMigrationsDir)) {
      const source = path.join(targetMigrationsDir, file);
      const dest = path.join(migrationsPath, file);
      if (!fs.existsSync(dest)) {
        if (fs.statSync(source).isDirectory()) {
          fs.cpSync(source, dest, { recursive: true });
        } else {
          fs.copyFileSync(source, dest);
        }
      }
    }
    console.log(`✓ Copied migration files to migrations/`);
  }

  if (dbEnv === 'dev') {
    console.log(`  Using SQLite at: ${process.env.DATABASE_URL || 'file:./dev.db'}`);
  }
} catch (error) {
  console.error(`✗ Failed to switch database provider: ${error.message}`);
  process.exit(1);
}
