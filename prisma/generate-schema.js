#!/usr/bin/env node

require('dotenv').config();
const { execSync } = require('child_process');

// Read DATABASE_URL to determine provider
const databaseUrl = process.env.DATABASE_URL;

let provider;
let isSqlite = false;
if (databaseUrl && databaseUrl.startsWith('file:')) {
  provider = 'sqlite';
  isSqlite = true;
} else if (databaseUrl && (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://'))) {
  provider = 'postgresql';
} else {
  console.error(`Invalid DATABASE_URL: "${databaseUrl}". Must start with file: (SQLite) or postgresql:// (PostgreSQL)`);
  process.exit(1);
}

// Read the base schema
const fs = require('fs');
const path = require('path');
const schemaPath = path.join(__dirname, 'schema.base.prisma');
let schema = fs.readFileSync(schemaPath, 'utf8');

// Replace placeholder with actual provider
schema = schema.replace('{{PROVIDER}}', provider);

// For SQLite, remove enum definitions and convert enum fields to String
if (isSqlite) {
  // Remove enum definitions (they're not supported in SQLite)
  schema = schema.replace(/\/\/ Badge system \(Phase 3\.1\)\nenum BadgeType \{\s*[\s\S]*?\n\}/, '// Badge types are stored as strings in SQLite');
  schema = schema.replace(/badgeType\s+BadgeType/, 'badgeType String');

  schema = schema.replace(/\/\/ Feedback system \(Phase 3\.2\)\nenum RaidMood \{\s*[\s\S]*?\n\}/, '// Mood types are stored as strings in SQLite');
  schema = schema.replace(/mood\s+RaidMood/, 'mood String');
}

// Write the generated schema
const outputPath = path.join(__dirname, 'schema.prisma');
fs.writeFileSync(outputPath, schema);

console.log(`Generated schema.prisma with provider: ${provider}`);

// Now run the appropriate database command
if (isSqlite) {
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', cwd: path.dirname(__dirname) });
  } catch (error) {
    console.error('Failed to push SQLite schema:', error.message);
    process.exit(1);
  }
} else {
  // For PostgreSQL, check if we need to create migrations
  const forceMigrations = process.argv.includes('--create-migrations');
  if (forceMigrations) {
    try {
      console.log('Creating PostgreSQL migration...');
      execSync('npx prisma migrate dev --name schema-update --create-only', { stdio: 'inherit', cwd: path.dirname(__dirname) });
    } catch (error) {
      console.error('Failed to create PostgreSQL migration:', error.message);
      process.exit(1);
    }
  }
}