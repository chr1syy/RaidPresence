-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "autoPurgeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoPurgeDays" INTEGER NOT NULL DEFAULT 30;