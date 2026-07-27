const prisma: Record<string, any> = {
  raid: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  raidAttendance: {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  userPreference: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  guild: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
  },
  team: {
    // Default team resolution succeeds out of the box so raid fixtures get a teamId
    findFirst: jest.fn().mockResolvedValue({ id: 'team-default', guildId: 'guild-1', name: 'Main', isDefault: true, createdBy: 'system' }),
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  userRolePreference: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

// Assigned separately to avoid circular type reference
prisma.$transaction = jest.fn((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

export default prisma;
