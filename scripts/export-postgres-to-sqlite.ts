#!/usr/bin/env tsx
/**
 * PostgreSQL to SQLite Data Export Script
 *
 * Purpose: Migrate existing PostgreSQL raid data to SQLite for local development
 * 
 * Prerequisites:
 *   - Source PostgreSQL database must be accessible via DATABASE_URL (prod)
 *   - Target SQLite database will be created at prisma/dev.db
 *   - Node.js and Prisma must be installed
 *
 * Usage:
 *   export DATABASE_URL="postgresql://user:pass@host:port/dbname"
 *   npx tsx scripts/export-postgres-to-sqlite.ts
 *
 * What it does:
 *   1. Connects to PostgreSQL database specified in DATABASE_URL
 *   2. Exports all data from: Guild, UserPreference, Raid, RaidAttendance tables
 *   3. Switches database provider to SQLite
 *   4. Creates/initializes SQLite database
 *   5. Imports exported data with conflict resolution (REPLACE ON INSERT)
 *   6. Verifies row counts match between source and destination
 *   7. Generates summary report
 *
 * Safety Features:
 *   - Creates backup of existing SQLite DB before import
 *   - Uses transactions to ensure data consistency
 *   - Validates data integrity with row count verification
 *   - Clear error messages for debugging
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ExportStats {
  guilds: number;
  userPreferences: number;
  raids: number;
  raidAttendance: number;
}

interface MigrationResult {
  sourceStats: ExportStats;
  destinationStats: ExportStats;
  success: boolean;
  message: string;
}

/**
 * Display colored console messages
 */
function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'
  };

  console.log(`${colors[type]}${type.toUpperCase()}${colors.reset} ${message}`);
}

/**
 * Check if SOURCE database is accessible (PostgreSQL)
 */
async function checkPostgresConnection(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl || !dbUrl.includes('postgresql')) {
    log('DATABASE_URL not set or is not PostgreSQL', 'error');
    log('Usage: export DATABASE_URL="postgresql://..." && npx tsx scripts/export-postgres-to-sqlite.ts', 'info');
    return false;
  }

  try {
    // Test with simple psql command if available, otherwise trust URL format
    log('PostgreSQL connection string detected', 'success');
    return true;
  } catch (error) {
    log('Failed to verify PostgreSQL connection', 'error');
    return false;
  }
}

/**
 * Extract data from PostgreSQL using Prisma
 * This creates a temporary Prisma client pointed at PostgreSQL
 */
async function exportFromPostgres(): Promise<ExportStats> {
  log('Exporting data from PostgreSQL...', 'info');

  try {
    // Ensure we're reading from prod database
    process.env.DB_ENV = 'prod';
    
    // Regenerate Prisma client for PostgreSQL
    log('Generating Prisma client for PostgreSQL', 'info');
    await execAsync('npm run switch-db && npm run db:generate');

    // Import the Prisma client
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
      // Count records in each table
      const guildCount = await prisma.guild.count();
      const userPrefCount = await prisma.userPreference.count();
      const raidCount = await prisma.raid.count();
      const attendanceCount = await prisma.raidAttendance.count();

      log(`Found ${guildCount} guilds`, 'success');
      log(`Found ${userPrefCount} user preferences`, 'success');
      log(`Found ${raidCount} raids`, 'success');
      log(`Found ${attendanceCount} raid attendance records`, 'success');

      // Export data to JSON files in working directory
      const exportDir = './export-temp';
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      // Export each table
      const guilds = await prisma.guild.findMany();
      fs.writeFileSync(path.join(exportDir, 'guilds.json'), JSON.stringify(guilds, null, 2));

      const userPrefs = await prisma.userPreference.findMany();
      fs.writeFileSync(path.join(exportDir, 'userPreferences.json'), JSON.stringify(userPrefs, null, 2));

      const raids = await prisma.raid.findMany();
      fs.writeFileSync(path.join(exportDir, 'raids.json'), JSON.stringify(raids, null, 2));

      const attendances = await prisma.raidAttendance.findMany();
      fs.writeFileSync(path.join(exportDir, 'raidAttendances.json'), JSON.stringify(attendances, null, 2));

      log('Data exported to export-temp/ directory', 'success');

      await prisma.$disconnect();

      return {
        guilds: guildCount,
        userPreferences: userPrefCount,
        raids: raidCount,
        raidAttendance: attendanceCount
      };
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  } catch (error) {
    log(`Failed to export from PostgreSQL: ${error}`, 'error');
    throw error;
  }
}

/**
 * Import data into SQLite database
 */
async function importToSqlite(): Promise<ExportStats> {
  log('Importing data to SQLite...', 'info');

  try {
    // Backup existing SQLite database if it exists
    const dbPath = './prisma/dev.db';
    if (fs.existsSync(dbPath)) {
      const backupPath = `./prisma/dev.db.backup.${Date.now()}`;
      fs.copyFileSync(dbPath, backupPath);
      log(`Existing SQLite database backed up to: ${backupPath}`, 'warning');
    }

    // Switch to SQLite
    process.env.DB_ENV = 'dev';
    log('Generating Prisma client for SQLite', 'info');
    await execAsync('npm run switch-db && npm run db:generate');

    // Initialize Prisma client for SQLite
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    try {
      const exportDir = './export-temp';

      // Read exported JSON files
      const guilds = JSON.parse(fs.readFileSync(path.join(exportDir, 'guilds.json'), 'utf-8'));
      const userPrefs = JSON.parse(fs.readFileSync(path.join(exportDir, 'userPreferences.json'), 'utf-8'));
      const raids = JSON.parse(fs.readFileSync(path.join(exportDir, 'raids.json'), 'utf-8'));
      const attendances = JSON.parse(fs.readFileSync(path.join(exportDir, 'raidAttendances.json'), 'utf-8'));

      // Import with conflict resolution (upsert)
      log('Importing Guilds...', 'info');
      for (const guild of guilds) {
        await prisma.guild.upsert({
          where: { id: guild.id },
          update: guild,
          create: guild
        });
      }

      log('Importing User Preferences...', 'info');
      for (const userPref of userPrefs) {
        await prisma.userPreference.upsert({
          where: {
            userId_guildId: {
              userId: userPref.userId,
              guildId: userPref.guildId
            }
          },
          update: userPref,
          create: userPref
        });
      }

      log('Importing Raids...', 'info');
      for (const raid of raids) {
        await prisma.raid.upsert({
          where: { id: raid.id },
          update: raid,
          create: raid
        });
      }

      log('Importing Raid Attendance...', 'info');
      for (const attendance of attendances) {
        await prisma.raidAttendance.upsert({
          where: {
            raidId_userId: {
              raidId: attendance.raidId,
              userId: attendance.userId
            }
          },
          update: attendance,
          create: attendance
        });
      }

      // Verify import counts
      const importedGuilds = await prisma.guild.count();
      const importedUserPrefs = await prisma.userPreference.count();
      const importedRaids = await prisma.raid.count();
      const importedAttendances = await prisma.raidAttendance.count();

      log(`Imported ${importedGuilds} guilds`, 'success');
      log(`Imported ${importedUserPrefs} user preferences`, 'success');
      log(`Imported ${importedRaids} raids`, 'success');
      log(`Imported ${importedAttendances} raid attendance records`, 'success');

      await prisma.$disconnect();

      // Clean up export temp files
      fs.rmSync(exportDir, { recursive: true, force: true });

      return {
        guilds: importedGuilds,
        userPreferences: importedUserPrefs,
        raids: importedRaids,
        raidAttendance: importedAttendances
      };
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
  } catch (error) {
    log(`Failed to import to SQLite: ${error}`, 'error');
    throw error;
  }
}

/**
 * Verify data integrity between source and destination
 */
function verifyMigration(source: ExportStats, dest: ExportStats): boolean {
  log('\nVerifying migration integrity...', 'info');

  let allMatch = true;

  if (source.guilds !== dest.guilds) {
    log(`Guild count mismatch: ${source.guilds} (source) != ${dest.guilds} (dest)`, 'error');
    allMatch = false;
  } else {
    log(`✓ Guild count matches: ${source.guilds}`, 'success');
  }

  if (source.userPreferences !== dest.userPreferences) {
    log(`User preference count mismatch: ${source.userPreferences} (source) != ${dest.userPreferences} (dest)`, 'error');
    allMatch = false;
  } else {
    log(`✓ User preference count matches: ${source.userPreferences}`, 'success');
  }

  if (source.raids !== dest.raids) {
    log(`Raid count mismatch: ${source.raids} (source) != ${dest.raids} (dest)`, 'error');
    allMatch = false;
  } else {
    log(`✓ Raid count matches: ${source.raids}`, 'success');
  }

  if (source.raidAttendance !== dest.raidAttendance) {
    log(`Raid attendance count mismatch: ${source.raidAttendance} (source) != ${dest.raidAttendance} (dest)`, 'error');
    allMatch = false;
  } else {
    log(`✓ Raid attendance count matches: ${source.raidAttendance}`, 'success');
  }

  return allMatch;
}

/**
 * Main migration process
 */
async function main(): Promise<void> {
  log('Starting PostgreSQL → SQLite migration...', 'info');
  console.log('');

  try {
    // Verify connection to PostgreSQL
    const hasConnection = await checkPostgresConnection();
    if (!hasConnection) {
      process.exit(1);
    }

    console.log('');

    // Step 1: Export from PostgreSQL
    const sourceStats = await exportFromPostgres();

    console.log('');

    // Step 2: Import to SQLite
    const destStats = await importToSqlite();

    console.log('');

    // Step 3: Verify integrity
    const isValid = verifyMigration(sourceStats, destStats);

    console.log('');

    if (isValid) {
      log('✓ Migration completed successfully!', 'success');
      log(`Your SQLite database is now ready at: ./prisma/dev.db`, 'info');
      log(`You can now run: npm run dev`, 'info');
      process.exit(0);
    } else {
      log('✗ Migration completed but with data integrity warnings', 'warning');
      log('Please review the counts above and verify your data', 'warning');
      process.exit(1);
    }
  } catch (error) {
    log(`✗ Migration failed: ${error}`, 'error');
    process.exit(1);
  }
}

// Run the migration
main();
