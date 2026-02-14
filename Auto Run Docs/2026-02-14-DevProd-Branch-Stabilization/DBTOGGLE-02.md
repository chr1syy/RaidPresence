# Phase 2: Reliable Dev/Prod DB Toggle (SQLite local + PostgreSQL Railway)

Goal: support local SQLite development while keeping deterministic PostgreSQL migrations for Railway production.

## Tasks

- [x] Make schema generation deterministic and startup-safe for both environments.

  Notes:
  - Refactored `prisma/generate-schema.js` to use explicit template token replacement (`{{PROVIDER}}`, enum/type tokens) for deterministic output from `prisma/schema.base.prisma`.
  - Added strict, explicit `DATABASE_URL` validation errors for missing/invalid values.
  - Added `--skip-db-sync`/`--schema-only` mode and wired `npm start` to run schema generation before `prisma migrate deploy`, preventing provider mismatch startup failures on PostgreSQL.
  - Added Jest coverage in `src/__tests__/prisma/generate-schema.test.ts` for provider detection, template rendering, and unresolved-token safety.
  - Verification run:
    - `DATABASE_URL='file:./dev.db' npm run db:migrate` ✅
    - `DATABASE_URL='postgresql://user:pass@localhost:5432/db' node prisma/generate-schema.js` ✅

  Scope:
  - Review and harden `prisma/generate-schema.js` and `prisma/schema.base.prisma`.
  - Ensure generated `prisma/schema.prisma` always matches active `DATABASE_URL` provider.
  - Add explicit failure messaging for invalid/missing `DATABASE_URL`.

  Constraints:
  - `npm start` on PostgreSQL must not fail due to SQLite schema mismatch.
  - Local dev with `DATABASE_URL=file:./dev.db` remains one-command setup.

  Verification:
  - `DATABASE_URL='file:./dev.db' npm run db:migrate`
  - `DATABASE_URL='postgresql://user:pass@localhost:5432/db' node prisma/generate-schema.js`

- [x] Restore a valid migration strategy for production and ensure `prisma/migrations/` is present and usable.

  Notes:
  - Reintroduced `prisma/migrations/` with canonical PostgreSQL artifacts:
    - `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`)
    - `prisma/migrations/20260214000000_canonical_postgresql/migration.sql`
  - Refactored `scripts/create-prod-migrations.js` to generate deterministic, reproducible migrations by:
    - Validating `DATABASE_URL` as PostgreSQL only (explicit failure messages for missing/SQLite/invalid schemes)
    - Running `node prisma/generate-schema.js --schema-only` first to guarantee provider/schema sync
    - Rebuilding canonical migration SQL via `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`
    - Rewriting migration lock content to enforce PostgreSQL migration provider consistency
  - Added Jest coverage in `src/__tests__/scripts/create-prod-migrations.test.ts` for URL validation, migration ID parsing, and canonical migration output/lock-file behavior.
  - Verification run:
    - `DATABASE_URL='postgresql://user:pass@localhost:5432/raidpresence' npm run db:prod-migrations` ✅
    - `DATABASE_URL='postgresql://user:pass@localhost:55432/raidpresence_test' npm run db:migrate:deploy` ⚠️ blocked by environment (`P1001: Can't reach database server at localhost:55432`)

  Scope:
  - Reintroduce migration history or regenerate canonical PostgreSQL migrations from the intended schema.
  - Keep `migration_lock.toml` consistent with provider used for production migrations.
  - Ensure `npm run db:prod-migrations` produces predictable outputs.

  Verification:
  - `npm run db:prod-migrations` (with PostgreSQL `DATABASE_URL`)
  - `npm run db:migrate:deploy` (against a PostgreSQL test DB)

- [ ] Validate Railway startup contract end-to-end.

  Scope:
  - Confirm `package.json` scripts (`start`, `db:migrate`, `db:prod-migrations`, `db:migrate:deploy`) work together without manual file edits.
  - Ensure startup sequence is safe if schema generation is needed before deploy.

  Verification:
  - Simulated prod run:
    - `DATABASE_URL='postgresql://user:pass@localhost:5432/db' npm run db:generate`
    - `DATABASE_URL='postgresql://user:pass@localhost:5432/db' npm run db:migrate:deploy`
