export {};

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('child_process', () => ({
  execSync: jest.fn(() => '-- sql migration script --\n'),
}));

const { execSync } = require('child_process');
const {
  CANONICAL_MIGRATION_ID,
  MIGRATION_LOCK_CONTENT,
  validatePostgresUrl,
  parseMigrationId,
  createCanonicalMigration,
} = require('../../../scripts/create-prod-migrations.js');

describe('scripts/create-prod-migrations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validatePostgresUrl', () => {
    it('rejects missing urls', () => {
      expect(() => validatePostgresUrl(undefined)).toThrow('DATABASE_URL is not set');
    });

    it('rejects sqlite urls', () => {
      expect(() => validatePostgresUrl('file:./dev.db')).toThrow('points to SQLite');
    });

    it('accepts postgres urls', () => {
      expect(validatePostgresUrl('postgresql://user:pass@localhost:5432/db')).toBe(
        'postgresql://user:pass@localhost:5432/db'
      );
      expect(validatePostgresUrl('postgres://user:pass@localhost:5432/db')).toBe(
        'postgres://user:pass@localhost:5432/db'
      );
    });
  });

  describe('parseMigrationId', () => {
    it('returns canonical id by default', () => {
      expect(parseMigrationId([])).toBe(CANONICAL_MIGRATION_ID);
    });

    it('accepts a valid override', () => {
      expect(parseMigrationId(['--migration-id=20260214123456_feature_x'])).toBe(
        '20260214123456_feature_x'
      );
    });

    it('rejects invalid override format', () => {
      expect(() => parseMigrationId(['--migration-id=bad'])).toThrow('Invalid --migration-id format');
    });
  });

  describe('createCanonicalMigration', () => {
    it('rewrites migrations to canonical migration + lock file', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'raidpresence-migrate-'));
      const prismaDir = path.join(tempRoot, 'prisma');
      const migrationsDir = path.join(prismaDir, 'migrations');
      fs.mkdirSync(path.join(migrationsDir, 'old_dir'), { recursive: true });
      fs.writeFileSync(path.join(migrationsDir, 'old_dir', 'migration.sql'), 'old');

      const result = createCanonicalMigration({ projectRoot: tempRoot });

      expect(result.migrationId).toBe(CANONICAL_MIGRATION_ID);
      expect(fs.existsSync(path.join(migrationsDir, 'old_dir'))).toBe(false);
      expect(fs.readFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'utf8')).toBe(
        MIGRATION_LOCK_CONTENT
      );
      expect(fs.readFileSync(path.join(result.migrationDir, 'migration.sql'), 'utf8')).toBe(
        '-- sql migration script --\n'
      );
      expect(execSync).toHaveBeenCalledWith(
        'npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script',
        expect.objectContaining({ cwd: tempRoot, encoding: 'utf8' })
      );
    });
  });
});
