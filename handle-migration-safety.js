#!/usr/bin/env node
/**
 * Safe Migration Deployment Script
 * 
 * Handles database provider mismatches during deployment.
 * Runs automatically on Railway before Prisma migrations.
 * 
 * WHAT IT DOES:
 *   1. Detects if migration_lock.toml provider doesn't match current provider
 *   2. If mismatch detected:
 *      - Backs up old migrations
 *      - Resets migration directory
 *      - Creates fresh migration for current provider
 *   3. If match found: proceeds normally
 * 
 * EXIT CODES:
 *   0 = Success (migrations ready to deploy)
 *   1 = Fatal error (deployment should stop)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const migrationsDir = path.join(__dirname, 'prisma', 'migrations');
const lockFile = path.join(migrationsDir, 'migration_lock.toml');
const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');

function log(message) {
  console.log(`[Migration Safety] ${message}`);
}

function error(message) {
  console.error(`[Migration Safety] ❌ ${message}`);
}

log('Starting safe migration deployment...');

// Determine current provider from schema.prisma
const schema = fs.readFileSync(schemaPath, 'utf-8');
const providerMatch = schema.match(/provider\s*=\s*"([^"]+)"/);
if (!providerMatch) {
  error('Could not determine database provider from schema.prisma');
  process.exit(1);
}
const currentProvider = providerMatch[1];
log(`Current schema provider: ${currentProvider}`);

// Check if migration lock exists
if (!fs.existsSync(lockFile)) {
  log('No migration lock found - first deployment. Will be created on first migration.');
  process.exit(0);
}

// Check migration lock provider
const lockContent = fs.readFileSync(lockFile, 'utf-8');
const lockProviderMatch = lockContent.match(/provider\s*=\s*"([^"]+)"/);
if (!lockProviderMatch) {
  error('Could not parse provider from migration_lock.toml');
  process.exit(1);
}
const lockProvider = lockProviderMatch[1];
log(`Migration lock provider: ${lockProvider}`);

// If providers match, we're good to go
if (currentProvider === lockProvider) {
  log(`✓ Providers match (${currentProvider}). Proceeding with normal migration deploy.`);
  process.exit(0);
}

// Provider mismatch detected - we need to reset migrations
log(`⚠️  Provider mismatch detected! Schema: ${currentProvider}, Lock: ${lockProvider}`);
log('Resetting migration history for provider switch...');

try {
  // Step 1: Backup old migrations
  const backupDir = path.join(__dirname, 'prisma', `migrations.${lockProvider}-backup`);
  if (fs.existsSync(backupDir)) {
    log(`Removing old backup directory: ${backupDir}`);
    execSync(`rm -rf "${backupDir}"`);
  }
  log(`Backing up ${lockProvider} migrations...`);
  execSync(`cp -r "${migrationsDir}" "${backupDir}"`);
  log(`✓ Backed up to: prisma/migrations.${lockProvider}-backup/`);

  // Step 2: Clear migrations directory
  log('Clearing old migration history...');
  execSync(`rm -rf "${migrationsDir}"`);
  fs.mkdirSync(migrationsDir, { recursive: true });
  log('✓ Migration history cleared');

  // Step 3: Generate Prisma client (triggers switch-db)
  log(`Generating Prisma client for ${currentProvider}...`);
  execSync('npm run db:generate', { stdio: 'pipe' });
  log('✓ Prisma client generated');

  // Step 4: Create fresh migration
  log(`Creating initial ${currentProvider} migration...`);
  execSync('npx prisma migrate dev --name init --skip-generate 2>/dev/null', { stdio: 'pipe' });
  log('✓ Migration created');

  // Step 5: Verify new lock file
  if (!fs.existsSync(lockFile)) {
    error('Migration lock file was not created');
    process.exit(1);
  }
  const newLockContent = fs.readFileSync(lockFile, 'utf-8');
  if (!newLockContent.includes(`provider = "${currentProvider}"`)) {
    error(`Migration lock does not show ${currentProvider} provider`);
    process.exit(1);
  }

  log(`✓ Migration lock verified: ${currentProvider}`);
  log(`✓ Migration history reset successfully for ${currentProvider}`);
  log('✓ Ready to deploy migrations to database');

  process.exit(0);
} catch (err) {
  error(`Failed during migration reset: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
