-- Rerunnable: every step is guarded on "PremiumTier still has a 'PRO' value", so applying
-- this migration to an already-migrated database is a no-op instead of an error.
-- Order is preserved: the data migration runs before the type swap.

-- MigrateData: existing PRO guilds keep their perks and become PREMIUM
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PremiumTier' AND e.enumlabel = 'PRO'
  ) THEN
    UPDATE "Guild" SET "premiumTier" = 'PREMIUM' WHERE "premiumTier"::text = 'PRO';
  END IF;
END $$;

-- AlterEnum: Postgres cannot drop an enum value, so swap in a new type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PremiumTier' AND e.enumlabel = 'PRO'
  ) THEN
    -- Clean up a scratch type left behind by a previously aborted run.
    DROP TYPE IF EXISTS "PremiumTier_new";

    CREATE TYPE "PremiumTier_new" AS ENUM ('FREE', 'PREMIUM');
    ALTER TABLE "Guild" ALTER COLUMN "premiumTier" DROP DEFAULT;
    ALTER TABLE "Guild" ALTER COLUMN "premiumTier" TYPE "PremiumTier_new"
      USING ("premiumTier"::text::"PremiumTier_new");
    ALTER TYPE "PremiumTier" RENAME TO "PremiumTier_old";
    ALTER TYPE "PremiumTier_new" RENAME TO "PremiumTier";
    DROP TYPE "PremiumTier_old";
    ALTER TABLE "Guild" ALTER COLUMN "premiumTier" SET DEFAULT 'FREE';
  END IF;
END $$;
