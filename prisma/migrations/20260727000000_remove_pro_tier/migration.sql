-- MigrateData: existing PRO guilds keep their perks and become PREMIUM
UPDATE "Guild" SET "premiumTier" = 'PREMIUM' WHERE "premiumTier" = 'PRO';

-- AlterEnum: Postgres cannot drop an enum value, so swap in a new type
CREATE TYPE "PremiumTier_new" AS ENUM ('FREE', 'PREMIUM');
ALTER TABLE "Guild" ALTER COLUMN "premiumTier" DROP DEFAULT;
ALTER TABLE "Guild" ALTER COLUMN "premiumTier" TYPE "PremiumTier_new" USING ("premiumTier"::text::"PremiumTier_new");
ALTER TYPE "PremiumTier" RENAME TO "PremiumTier_old";
ALTER TYPE "PremiumTier_new" RENAME TO "PremiumTier";
DROP TYPE "PremiumTier_old";
ALTER TABLE "Guild" ALTER COLUMN "premiumTier" SET DEFAULT 'FREE';
