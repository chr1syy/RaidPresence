-- AddForeignKey
ALTER TABLE "UserRolePreference" ADD CONSTRAINT "UserRolePreference_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
