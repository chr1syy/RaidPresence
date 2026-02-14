#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const POSTGRES_BADGE_ENUM_BLOCK = `// Badge system (Phase 3.1)
enum BadgeType {
  PERFECT_ATTENDANCE // 10 consecutive raids attending
  TANK_MAIN          // 5 raids as tank
  HEALER_HERO        // 5 raids as healer
  DAMAGE_DEALER      // 5 raids as DPS
  SHARPSHOOTER       // 5 raids as ranged DPS
  ALWAYS_ON_TIME     // 5 raids without being late
  EARLY_BIRD         // First to respond to raid
  TEAM_PLAYER        // Flex to 3 different roles
  RELIABLE_MEMBER    // 95%+ attendance (30 days)
  RISING_STAR        // 30% improvement in attendance
  VETERAN_RAIDER     // 25 total raids attended
  LEADERS_CHOICE     // Awarded manually by raid leader
}`;

const SQLITE_BADGE_ENUM_BLOCK = '// Badge types are stored as strings in SQLite';

const POSTGRES_RAID_MOOD_ENUM_BLOCK = `// Feedback system (Phase 3.2)
enum RaidMood {
  GREAT
  OKAY
  FRUSTRATING
}`;

const SQLITE_RAID_MOOD_ENUM_BLOCK = '// Mood types are stored as strings in SQLite';

function detectProvider(databaseUrl) {
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error(
      'DATABASE_URL is not set. Use "file:./dev.db" for SQLite development or "postgresql://..." for PostgreSQL.'
    );
  }

  const trimmedUrl = databaseUrl.trim();
  if (/^file:/i.test(trimmedUrl)) {
    return 'sqlite';
  }

  if (/^postgres(ql)?:\/\//i.test(trimmedUrl)) {
    return 'postgresql';
  }

  throw new Error(
    `Invalid DATABASE_URL "${databaseUrl}". Expected scheme "file:" (SQLite) or "postgresql://"/"postgres://" (PostgreSQL).`
  );
}

function applyToken(template, token, value) {
  return template.replaceAll(token, value);
}

function buildSchema(baseSchema, provider) {
  const isSqlite = provider === 'sqlite';
  const replacements = {
    '{{PROVIDER}}': provider,
    '{{BADGE_ENUM_BLOCK}}': isSqlite ? SQLITE_BADGE_ENUM_BLOCK : POSTGRES_BADGE_ENUM_BLOCK,
    '{{BADGE_TYPE}}': isSqlite ? 'String' : 'BadgeType',
    '{{RAID_MOOD_ENUM_BLOCK}}': isSqlite ? SQLITE_RAID_MOOD_ENUM_BLOCK : POSTGRES_RAID_MOOD_ENUM_BLOCK,
    '{{RAID_MOOD_TYPE}}': isSqlite ? 'String' : 'RaidMood',
  };

  let schema = baseSchema;
  for (const [token, value] of Object.entries(replacements)) {
    schema = applyToken(schema, token, value);
  }

  const unresolvedTokens = schema.match(/\{\{[A-Z_]+\}\}/g);
  if (unresolvedTokens) {
    throw new Error(`Unresolved schema placeholders: ${unresolvedTokens.join(', ')}`);
  }

  return `${schema.trimEnd()}\n`;
}

function generateSchema({ databaseUrl, args = [] }) {
  const provider = detectProvider(databaseUrl);
  const isSqlite = provider === 'sqlite';
  const shouldSkipDbSync = args.includes('--skip-db-sync') || args.includes('--schema-only');
  const shouldCreateMigrations = args.includes('--create-migrations');

  const schemaPath = path.join(__dirname, 'schema.base.prisma');
  const outputPath = path.join(__dirname, 'schema.prisma');
  const baseSchema = fs.readFileSync(schemaPath, 'utf8');
  const schema = buildSchema(baseSchema, provider);
  fs.writeFileSync(outputPath, schema, 'utf8');

  console.log(`Generated schema.prisma with provider: ${provider}`);

  if (shouldSkipDbSync) {
    return provider;
  }

  if (isSqlite) {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit', cwd: path.dirname(__dirname) });
    return provider;
  }

  if (shouldCreateMigrations) {
    console.log('Creating PostgreSQL migration...');
    execSync('npx prisma migrate dev --name schema-update --create-only', {
      stdio: 'inherit',
      cwd: path.dirname(__dirname),
    });
  }

  return provider;
}

if (require.main === module) {
  try {
    generateSchema({
      databaseUrl: process.env.DATABASE_URL,
      args: process.argv.slice(2),
    });
  } catch (error) {
    console.error('Schema generation failed:', error.message);
    process.exit(1);
  }
}

module.exports = {
  detectProvider,
  buildSchema,
  generateSchema,
};
