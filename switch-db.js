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

  // 2. Ensure target migrations directory exists
  if (!fs.existsSync(targetMigrationsDir)) {
    fs.mkdirSync(targetMigrationsDir, { recursive: true });
    console.log(`✓ Created ${dbEnv} migrations directory`);
  }

  // 3. Switch migrations symlink
  // Remove old symlink if it exists
  if (fs.existsSync(migrationsPath)) {
    try {
      fs.unlinkSync(migrationsPath);
    } catch (err) {
      // If it's a directory (not a symlink), remove it completely
      fs.rmSync(migrationsPath, { recursive: true, force: true });
    }
  }

  // Create symlink to active migrations directory
  // Note: On Windows, this requires admin privileges or developer mode
  // Fallback: if symlink fails, try copying directories instead
  try {
    const isWin = process.platform === 'win32';
    if (isWin) {
      // Windows: use junction (directory symlink) which doesn't need admin
      fs.symlinkSync(targetMigrationsDir, migrationsPath, 'junction');
    } else {
      // Unix: use regular symlink
      fs.symlinkSync(targetMigrationsDir, migrationsPath);
    }
    console.log(`✓ Linked migrations/ → migrations-${dbEnv}/`);
  } catch (symlinkErr) {
    // Fallback: if symlink fails, just copy the directory content
    console.log(`⚠ Symlink failed, copying migration files instead`);
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }
    const migrationFiles = fs.readdirSync(targetMigrationsDir);
    for (const file of migrationFiles) {
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
