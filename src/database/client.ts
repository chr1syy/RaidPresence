import { PrismaClient } from '@prisma/client';

/**
 * Prisma database client instance for all database operations.
 * 
 * This client provides type-safe access to the database through Prisma's generated client.
 * Use this instance for all database queries, mutations, and transactions throughout the application.
 * The client is configured with default connection settings and should be reused across operations.
 * 
 * Properties:
 *   - raid: Prisma.RaidDelegate - Operations for raid entities (find, create, update, delete)
 *   - guild: Prisma.GuildDelegate - Operations for guild/server configurations
 *   - [other models as defined in schema.prisma]
 * 
 * Example:
 *   const raids = await prisma.raid.findMany({ where: { guildId: '123' } });
 */
const prisma = new PrismaClient();

export default prisma;
