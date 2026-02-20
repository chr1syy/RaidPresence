#!/usr/bin/env node
/**
 * Production Migration Reset Script
 * 
 * Fixes P3019 error: "datasource provider does not match migration_lock.toml"
 * 
 * This script safely resets migrations when switching database providers.
 * 
 * USAGE:
 *   node fix-production-migrations.js
 * 
 * WHAT IT DOES:
 *   1. Backs up current migrations to migrations.sqlite-backup
 *   2. Removes old SQLite migration history
 *   3. Ensures DB_ENV=prod and DATABASE_URL are set
 *   4. Creates fresh PostgreSQL migration
 *   5. Verifies new migration lock shows "postgresql"
 * 
 * REQUIREMENTS:
 *   - NODE_ENV or DB_ENV must be "prod"
 *   - DATABASE_URL must be set in environment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const migrationsDir = path.join(__dirname, 'prisma', 'migrations');
const backupDir = path.join(__dirname, 'prisma', 'migrations.sqlite-backup');
const lockFile = path.join(migrationsDir, 'migration_lock.toml');

console.log('🔧 Production Migration Reset\n');

// Check environment
const dbEnv = process.env.DB_ENV || process.env.NODE_ENV;
const databaseUrl = process.env.DATABASE_URL;

if (dbEnv !== 'prod') {
  console.error('❌ Error: DB_ENV or NODE_ENV must be "prod"');
  console.error(`   Current: ${dbEnv || 'not set'}`);
  process.exit(1);
}

if (!databaseUrl) {
  console.error('❌ Error: DATABASE_URL must be set');
  console.error('   Set: export DATABASE_URL="postgresql://..."');
  process.exit(1);
}

console.log('✓ Environment check passed');
console.log(`  DB_ENV: ${dbEnv}`);
console.log(`  DATABASE_URL: ${databaseUrl.split('@')[0]}@...`);

// Step 1: Backup existing migrations
if (fs.existsSync(migrationsDir)) {
  console.log('\n📦 Backing up current migrations...');
  if (fs.existsSync(backupDir)) {
    execSync(`rm -rf "${backupDir}"`);
  }
  execSync(`cp -r "${migrationsDir}" "${backupDir}"`);
  console.log(`✓ Backed up to: prisma/migrations.sqlite-backup/`);
} else {
  console.log('\n✓ No existing migrations to back up');
}

// Step 2: Remove migration history
console.log('\n🗑️  Removing old migration history...');
if (fs.existsSync(migrationsDir)) {
  execSync(`rm -rf "${migrationsDir}"`);
}
fs.mkdirSync(migrationsDir, { recursive: true });
console.log('✓ Cleared migrations directory');

// Step 3: Generate Prisma client with PostgreSQL provider
console.log('\n🔄 Generating Prisma client with PostgreSQL...');
try {
  execSync('npm run db:generate', { stdio: 'inherit' });
  console.log('✓ Prisma client generated');
} catch (error) {
  console.error('❌ Failed to generate Prisma client');
  process.exit(1);
}

// Step 4: Create initial PostgreSQL migration
console.log('\n📝 Creating initial PostgreSQL migration...');
try {
  execSync('npx prisma migrate dev --name init --skip-generate', { stdio: 'inherit' });
  console.log('✓ PostgreSQL migration created');
} catch (error) {
  console.error('❌ Failed to create migration');
  process.exit(1);
}

// Step 5: Verify migration lock
console.log('\n✅ Verifying migration lock...');
if (fs.existsSync(lockFile)) {
  const lockContent = fs.readFileSync(lockFile, 'utf-8');
  if (lockContent.includes('provider = "postgresql"')) {
    console.log('✓ Migration lock verified: postgresql');
    console.log('\n🎉 Success! Your migrations are ready for PostgreSQL deployment.');
    console.log('\nNext steps:');
    console.log('  1. npm run build');
    console.log('  2. npm start');
    console.log('\n📚 Documentation: See DEPLOY_FIX.md for details.');
  } else {
    console.error('❌ Migration lock does not show postgresql provider');
    console.error('Content:', lockContent);
    process.exit(1);
  }
} else {
  console.error('❌ Migration lock file not found');
  process.exit(1);
}
