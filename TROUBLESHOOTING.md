# Troubleshooting Guide

Common issues and solutions for RaidPresence bot.

## Bot Not Responding to Commands

**Symptoms:** Slash commands don't appear or bot doesn't reply when commands are used.

**Solutions:**
1. **Verify Bot Token**: Check that `DISCORD_TOKEN` in `.env` is correct and hasn't expired
2. **Check Bot Status**: Ensure the bot shows as "Online" in your Discord server member list
3. **Deploy Commands**: Run `npm run deploy` to register slash commands with Discord
4. **Check Permissions**: Verify the bot has these permissions:
   - Send Messages
   - Embed Links
   - Use Slash Commands
   - Read Message History
5. **Restart Bot**: Stop and restart the bot process (`npm run dev` or `npm start`)
6. **Check Console**: Look for error messages in the bot's console output

## No One Added to Raid

**Symptoms:** Created a raid but the roster is empty or missing members.

**Solutions:**
1. **Configure Default Raid Roles**: Run `/config raid-roles roles:YourRoleName` to set default roles, or specify roles directly when creating a raid with `/raid create ... roles:RoleName`
2. **Specify Roles in Raid Command**: Include the `roles` parameter when creating the raid:
   - `/raid create date:2026-01-15 time:20:00 title:Tuesday Raid roles:Raider`
   - `/raid create date:2026-01-15 time:20:00 title:Tuesday Raid roles:"Raiders,Backups"`
   - `/raid create date:2026-01-15 time:20:00 title:Tuesday Raid roles:123456789012345678` (using a role ID)
3. **Verify Role Names**: Role names used in the `roles` parameter are case-sensitive — check that spelling and capitalization match the Discord role exactly
4. **Use Role IDs if Needed**: If role names aren't working, use role IDs in the `roles` parameter instead (right-click role → Copy ID with Developer Mode enabled)
5. **Check Server Members Intent**: Ensure "Server Members Intent" is enabled in Discord Developer Portal → Bot section
6. **Member Cache**: The bot needs to see server members. Try:
   - Restarting the bot
   - Waiting a few minutes for member cache to populate
   - Ensure bot has "Read Members" permission

## Database Errors

**Symptoms:** Error messages about database connection, schema, or queries.

**Solutions:**
1. **Generate Prisma Client**: Run `npm run db:generate` after any schema changes
2. **Apply Migrations**: Run `npm run db:migrate` to update database structure
3. **Check DATABASE_URL**: Verify the connection string in `.env` is correct
4. **File Permissions**: For SQLite (`file:./dev.db`), ensure the file is writable
5. **PostgreSQL Connection**: For production databases, verify:
   - Database server is running
   - Credentials are correct
   - Network/firewall allows connection
   - Database exists
6. **Reset Development Database**:
   ```bash
   rm dev.db
   npm run db:migrate
   ```

## Permission Errors

**Symptoms:** "You don't have permission" when using raid management commands.

**Solutions:**
1. **Configure Leader Roles**: Run `/config leader-roles roles:Officer,RaidLeader`
2. **Check Your Roles**: Ensure you have one of the configured leader roles
3. **Alternative Permission**: If leader roles aren't configured, you need Discord's "ManageEvents" permission
4. **Administrator Commands**: `/config` commands require Discord Administrator permission

## Raid Embed Not Updating

**Symptoms:** Changes to attendance don't reflect in the raid message.

**Solutions:**
1. **Use Refresh Command**: Run `/raid refresh raid_id:xyz` to force an update
2. **Check Bot Permissions**: Ensure bot can edit messages in the channel
3. **Message Deleted**: If the original message was deleted, create a new raid
4. **Database Connection**: Check for database errors in console

## Common Discord Permission Issues

**Problem:** Bot can't send messages or embeds.

**Solution:** Ensure the bot role has these permissions in the channel:
- View Channel
- Send Messages
- Embed Links
- Read Message History

**Problem:** Bot can't scan server members for raid roster.

**Solution:** 
1. Enable "Server Members Intent" in Discord Developer Portal
2. Ensure bot has "Read Members" permission in server settings

**Problem:** Buttons don't work when clicked.

**Solution:**
1. Verify bot is online
2. Check console for interaction errors
3. Ensure bot token hasn't expired
4. Try refreshing Discord (Ctrl+R)
