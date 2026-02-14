const { buildSchema, detectProvider } = require('../../../prisma/generate-schema.js');

describe('prisma/generate-schema', () => {
  describe('detectProvider', () => {
    it('throws a clear error when DATABASE_URL is missing', () => {
      expect(() => detectProvider(undefined)).toThrow('DATABASE_URL is not set');
    });

    it('detects sqlite from file URL', () => {
      expect(detectProvider('file:./dev.db')).toBe('sqlite');
    });

    it('detects postgresql from both postgres schemes', () => {
      expect(detectProvider('postgresql://user:pass@host:5432/db')).toBe('postgresql');
      expect(detectProvider('postgres://user:pass@host:5432/db')).toBe('postgresql');
    });

    it('throws a clear error for unsupported schemes', () => {
      expect(() => detectProvider('mysql://user:pass@host/db')).toThrow('Invalid DATABASE_URL');
    });
  });

  describe('buildSchema', () => {
    const template = [
      'datasource db {',
      '  provider = "{{PROVIDER}}"',
      '}',
      '',
      '{{BADGE_ENUM_BLOCK}}',
      'model Badge {',
      '  badgeType {{BADGE_TYPE}}',
      '}',
      '',
      '{{RAID_MOOD_ENUM_BLOCK}}',
      'model RaidFeedback {',
      '  mood {{RAID_MOOD_TYPE}}',
      '}',
      '',
    ].join('\n');

    it('generates sqlite schema without enums', () => {
      const sqliteSchema = buildSchema(template, 'sqlite');

      expect(sqliteSchema).toContain('provider = "sqlite"');
      expect(sqliteSchema).toContain('badgeType String');
      expect(sqliteSchema).toContain('mood String');
      expect(sqliteSchema).not.toContain('enum BadgeType');
      expect(sqliteSchema).not.toContain('enum RaidMood');
    });

    it('generates postgresql schema with enums', () => {
      const postgresSchema = buildSchema(template, 'postgresql');

      expect(postgresSchema).toContain('provider = "postgresql"');
      expect(postgresSchema).toContain('badgeType BadgeType');
      expect(postgresSchema).toContain('mood RaidMood');
      expect(postgresSchema).toContain('enum BadgeType');
      expect(postgresSchema).toContain('enum RaidMood');
    });

    it('fails if placeholders remain unresolved', () => {
      expect(() => buildSchema('{{UNKNOWN_TOKEN}}', 'sqlite')).toThrow('Unresolved schema placeholders');
    });
  });
});
