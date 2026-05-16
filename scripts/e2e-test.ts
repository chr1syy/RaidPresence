#!/usr/bin/env npx tsx
/**
 * E2E Premium Test Harness
 *
 * Interactive CLI that sets up database state for manual Discord testing,
 * guides you through what to test, and verifies the results.
 *
 * Usage:
 *   npx tsx scripts/e2e-test.ts                    # interactive menu
 *   npx tsx scripts/e2e-test.ts free-tier           # run specific scenario
 *   npx tsx scripts/e2e-test.ts --guild 123456789   # override guild ID
 */

import 'dotenv/config';
import { PrismaClient, PremiumTier } from '@prisma/client';
import * as readline from 'node:readline';

// ── ANSI helpers ────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

const ok = (s: string) => `${GREEN}✓ PASS${RESET} ${s}`;
const fail = (s: string) => `${RED}✗ FAIL${RESET} ${s}`;
const heading = (s: string) => `\n${BOLD}${CYAN}═══ ${s} ═══${RESET}`;
const note = (s: string) => `${DIM}${s}${RESET}`;
const change = (s: string) => `  ${YELLOW}→${RESET} ${s}`;

// ── Readline helpers ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    rl.question(`\n${DIM}Press Enter when done testing...${RESET}`, () => resolve());
  });
}

// ── Prisma ──────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ── Types ───────────────────────────────────────────────────────────────────

interface VerifyResult {
  passed: boolean;
  label: string;
}

interface Scenario {
  name: string;
  description: string;
  apply(guildId: string): Promise<void>;
  instructions: string[];
  verify(guildId: string): Promise<VerifyResult[]>;
}

// ── Scenarios ───────────────────────────────────────────────────────────────

const scenarios: Scenario[] = [
  {
    name: 'free-tier',
    description: 'Set guild to FREE tier, reset weekly count',
    async apply(guildId) {
      console.log(change('premiumTier → FREE'));
      console.log(change('premiumExpiresAt → null'));
      console.log(change('entitlementId → null'));
      console.log(change('weeklyRaidCount → 0'));
      console.log(change('weeklyRaidCountResetAt → null'));
      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.FREE,
          premiumExpiresAt: null,
          entitlementId: null,
          weeklyRaidCount: 0,
          weeklyRaidCountResetAt: null,
        },
      });
    },
    instructions: [
      '/raid archive <any raid> → expect upsell: "Upgrade to Premium to unlock Raid Archive..."',
      '/raid unarchive <any raid> → same upsell',
      '/raid search → same upsell',
      '/stats guild → expect upsell: "Upgrade to Premium to unlock Attendance Analytics..."',
      '/stats suggest → same upsell',
      'Click "Opt Out" on a raid → direct opt-out (no reason modal)',
      '/raid create → should succeed (0/5 used)',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const count = guild?.weeklyRaidCount ?? 0;
      return [
        { passed: guild?.premiumTier === 'FREE', label: 'premiumTier is FREE' },
        { passed: guild?.premiumExpiresAt === null, label: 'premiumExpiresAt is null' },
        { passed: count <= 5, label: `weeklyRaidCount within FREE limit (${count}/5)` },
      ];
    },
  },

  {
    name: 'premium-tier',
    description: 'Set guild to PREMIUM tier (30-day expiry)',
    async apply(guildId) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      console.log(change('premiumTier → PREMIUM'));
      console.log(change(`premiumExpiresAt → ${expiresAt.toISOString()}`));
      console.log(change('entitlementId → e2e-test-premium'));
      console.log(change('weeklyRaidCount → 0'));
      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.PREMIUM,
          premiumExpiresAt: expiresAt,
          entitlementId: 'e2e-test-premium',
          weeklyRaidCount: 0,
          weeklyRaidCountResetAt: null,
        },
      });
    },
    instructions: [
      'First run /config archive-channel #some-channel → required for archive to work',
      '/raid archive <any raid> → should succeed, raid moves to archive channel',
      '/raid unarchive <any raid> → should succeed, full raid embed with buttons restored in original channel',
      '/raid search → should return results',
      '/stats guild → should display analytics embed',
      '/stats suggest → should display composition suggestions',
      '/stats attendance @yourself → should show FULL history (no 10-raid cap)',
      'Click "Opt Out" on a raid → modal should appear with reason field',
      '/raid create → should succeed with no weekly limit',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      return [
        { passed: guild?.premiumTier === 'PREMIUM', label: 'premiumTier is PREMIUM' },
        { passed: guild?.premiumExpiresAt != null && guild.premiumExpiresAt > new Date(), label: 'premiumExpiresAt is in the future' },
      ];
    },
  },

  {
    name: 'pro-tier',
    description: 'Set guild to PRO tier (30-day expiry)',
    async apply(guildId) {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      console.log(change('premiumTier → PRO'));
      console.log(change(`premiumExpiresAt → ${expiresAt.toISOString()}`));
      console.log(change('entitlementId → e2e-test-pro'));
      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.PRO,
          premiumExpiresAt: expiresAt,
          entitlementId: 'e2e-test-pro',
          weeklyRaidCount: 0,
          weeklyRaidCountResetAt: null,
        },
      });
    },
    instructions: [
      'All PREMIUM features should work (archive, opt-out reason, full history, analytics)',
      '/raid create → no weekly limit',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      return [
        { passed: guild?.premiumTier === 'PRO', label: 'premiumTier is PRO' },
        { passed: guild?.premiumExpiresAt != null && guild.premiumExpiresAt > new Date(), label: 'premiumExpiresAt is in the future' },
      ];
    },
  },

  {
    name: 'weekly-limit-at-4',
    description: 'FREE tier with 4/5 weekly raids used (one left)',
    async apply(guildId) {
      console.log(change('premiumTier → FREE'));
      console.log(change('weeklyRaidCount → 4'));
      console.log(change('weeklyRaidCountResetAt → now (start new window)'));
      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.FREE,
          premiumExpiresAt: null,
          entitlementId: null,
          weeklyRaidCount: 4,
          weeklyRaidCountResetAt: new Date(),
        },
      });
    },
    instructions: [
      '/raid create → should succeed (5th raid, last allowed)',
      '/raid create again → should be BLOCKED with "Weekly raid limit reached (5/5). Resets <date>. Upgrade to Premium for unlimited raids."',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const count = guild?.weeklyRaidCount ?? 0;
      return [
        { passed: guild?.premiumTier === 'FREE', label: 'premiumTier is FREE' },
        { passed: count >= 4 && count <= 5, label: `weeklyRaidCount is ${count} (expected 4 or 5 after test)` },
      ];
    },
  },

  {
    name: 'weekly-limit-full',
    description: 'FREE tier at 5/5 weekly limit (blocked immediately)',
    async apply(guildId) {
      console.log(change('premiumTier → FREE'));
      console.log(change('weeklyRaidCount → 5'));
      console.log(change('weeklyRaidCountResetAt → now'));
      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.FREE,
          premiumExpiresAt: null,
          entitlementId: null,
          weeklyRaidCount: 5,
          weeklyRaidCountResetAt: new Date(),
        },
      });
    },
    instructions: [
      '/raid create → should be BLOCKED immediately with "Weekly raid limit reached (5/5). Resets <date>. Upgrade to Premium for unlimited raids."',
      'Verify the reset date is ~7 days from now and formatted in your guild language',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      return [
        { passed: guild?.premiumTier === 'FREE', label: 'premiumTier is FREE' },
        { passed: guild?.weeklyRaidCount === 5, label: 'weeklyRaidCount is 5' },
      ];
    },
  },

  {
    name: 'seed-attendance',
    description: 'Create 15+ attendance records for history cap testing',
    async apply(guildId) {
      // Check if already seeded
      const existing = await prisma.raid.count({
        where: { guildId, description: { startsWith: 'E2E Test Raid' } },
      });
      if (existing >= 15) {
        console.log(note(`  Already seeded (${existing} e2e raids exist). Skipping creation.`));
      } else {
        const userId = process.env.TEST_USER_ID || await ask(`  Enter your Discord user ID: `);
        const username = process.env.TEST_USERNAME || await ask(`  Enter your Discord username: `);
        const toCreate = 15 - existing;
        console.log(change(`Creating ${toCreate} closed raids with attendance for ${username}`));

        for (let i = existing; i < 15; i++) {
          const raid = await prisma.raid.create({
            data: {
              guildId,
              channelId: 'e2e-test-channel',
              raidDate: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
              description: `E2E Test Raid #${i + 1}`,
              status: 'closed',
              createdBy: userId,
              roles: '',
            },
          });

          // Ensure UserPreference exists (required by foreign key)
          await prisma.userPreference.upsert({
            where: { userId_guildId: { userId, guildId } },
            update: {},
            create: { userId, guildId, username },
          });

          await prisma.raidAttendance.create({
            data: {
              raidId: raid.id,
              userId,
              guildId,
              username,
              status: 'attending',
              respondedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
            },
          });
        }
      }

      // Ensure guild is FREE so cap applies
      console.log(change('premiumTier → FREE (so history cap applies)'));
      await prisma.guild.update({
        where: { id: guildId },
        data: { premiumTier: PremiumTier.FREE, premiumExpiresAt: null, entitlementId: null },
      });
    },
    instructions: [
      '/stats attendance @yourself period:all → should show only 10 raids',
      'Footer should say: "Showing last 10 raids. Upgrade to Premium for full history."',
      'Then run scenario "premium-tier" and repeat → should show all 15+ raids',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const e2eRaids = await prisma.raid.count({
        where: { guildId, description: { startsWith: 'E2E Test Raid' } },
      });
      return [
        { passed: e2eRaids >= 15, label: `${e2eRaids} e2e test raids exist (need ≥15)` },
        { passed: guild?.premiumTier === 'FREE', label: 'premiumTier is FREE (cap active)' },
      ];
    },
  },

  {
    name: 'expire-premium',
    description: 'Set premium expiry to 1 minute ago (tests getTier expiration)',
    async apply(guildId) {
      const expiredAt = new Date(Date.now() - 60 * 1000);
      console.log(change('premiumTier → PREMIUM (stored)'));
      console.log(change(`premiumExpiresAt → ${expiredAt.toISOString()} (expired)`));
      console.log(note('  getTier() will resolve this to FREE because expiry is in the past'));
      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.PREMIUM,
          premiumExpiresAt: expiredAt,
          entitlementId: 'e2e-test-expired',
        },
      });
    },
    instructions: [
      '/raid archive → should be BLOCKED (effective tier is FREE despite DB saying PREMIUM)',
      '/stats guild → should be BLOCKED',
      '/raid create → should be subject to weekly limit',
      'Note: DB says PREMIUM but getTier() checks premiumExpiresAt and returns FREE',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      return [
        { passed: guild?.premiumTier === 'PREMIUM', label: 'premiumTier stored as PREMIUM' },
        { passed: guild?.premiumExpiresAt != null && guild.premiumExpiresAt < new Date(), label: 'premiumExpiresAt is in the past (expired)' },
      ];
    },
  },

  {
    name: 'reset',
    description: 'Clear all premium state + delete e2e test data',
    async apply(guildId) {
      console.log(change('premiumTier → FREE'));
      console.log(change('All premium fields → null/0'));

      const e2eRaidCount = await prisma.raid.count({
        where: { guildId, description: { startsWith: 'E2E Test Raid' } },
      });
      if (e2eRaidCount > 0) {
        console.log(change(`Deleting ${e2eRaidCount} e2e test raids (and their attendance)`));
        // Cascade deletes attendance via onDelete: Cascade
        await prisma.raid.deleteMany({
          where: { guildId, description: { startsWith: 'E2E Test Raid' } },
        });
      }

      await prisma.guild.update({
        where: { id: guildId },
        data: {
          premiumTier: PremiumTier.FREE,
          premiumExpiresAt: null,
          entitlementId: null,
          weeklyRaidCount: 0,
          weeklyRaidCountResetAt: null,
          trialStartedAt: null,
        },
      });
    },
    instructions: [
      'Guild is now clean free-tier. All premium features should be gated.',
    ],
    async verify(guildId) {
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const e2eRaids = await prisma.raid.count({
        where: { guildId, description: { startsWith: 'E2E Test Raid' } },
      });
      return [
        { passed: guild?.premiumTier === 'FREE', label: 'premiumTier is FREE' },
        { passed: guild?.premiumExpiresAt === null, label: 'premiumExpiresAt is null' },
        { passed: guild?.entitlementId === null, label: 'entitlementId is null' },
        { passed: guild?.weeklyRaidCount === 0, label: 'weeklyRaidCount is 0' },
        { passed: e2eRaids === 0, label: 'e2e test raids cleaned up' },
      ];
    },
  },
];

// ── Run a single scenario ───────────────────────────────────────────────────

async function runScenario(scenario: Scenario, guildId: string): Promise<void> {
  console.log(heading(scenario.name));
  console.log(`${DIM}${scenario.description}${RESET}\n`);

  // Apply
  console.log(`${BOLD}DB changes:${RESET}`);
  await scenario.apply(guildId);

  console.log(`\n  ${YELLOW}⚠  The bot caches tier in memory for 30s.${RESET}`);
  console.log(`  ${YELLOW}   Restart the bot after tier changes: ${BOLD}docker compose restart bot${RESET}\n`);

  // Instructions
  console.log(`${BOLD}Now test in Discord:${RESET}`);
  scenario.instructions.forEach((inst, i) => {
    console.log(`  ${i + 1}. ${inst}`);
  });

  await waitForEnter();

  // Verify
  console.log(`\n${BOLD}Verification:${RESET}`);
  const results = await scenario.verify(guildId);
  for (const r of results) {
    console.log(`  ${r.passed ? ok(r.label) : fail(r.label)}`);
  }

  const allPassed = results.every((r) => r.passed);
  console.log(allPassed ? `\n${GREEN}${BOLD}All checks passed.${RESET}` : `\n${RED}${BOLD}Some checks failed.${RESET}`);
}

// ── Menu ────────────────────────────────────────────────────────────────────

function showMenu(guildId: string): void {
  console.log(`\n${BOLD}${CYAN}╔═══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║   RaidPresence E2E Premium Test Harness       ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚═══════════════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}Guild: ${guildId}${RESET}\n`);

  scenarios.forEach((s, i) => {
    const num = String(i + 1).padStart(2);
    console.log(`  ${CYAN}${num})${RESET} ${s.name.padEnd(20)} ${DIM}— ${s.description}${RESET}`);
  });
  console.log(`  ${CYAN} 0)${RESET} exit`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Parse args
  const args = process.argv.slice(2);
  let guildId = process.env.GUILD_ID || '';
  let scenarioName: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--guild' && args[i + 1]) {
      guildId = args[++i];
    } else if (!args[i].startsWith('-')) {
      scenarioName = args[i];
    }
  }

  if (!guildId) {
    console.error(`${RED}Error: No guild ID. Set GUILD_ID in .env or pass --guild <id>${RESET}`);
    process.exit(1);
  }

  // Verify guild exists
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) {
    console.error(`${RED}Error: Guild ${guildId} not found in database.${RESET}`);
    console.error(`${DIM}Start the bot and let it join the server first, or check your GUILD_ID.${RESET}`);
    process.exit(1);
  }

  console.log(`${GREEN}Connected to database.${RESET} Guild: ${guild.name} (${guildId})`);
  console.log(`${DIM}Current tier: ${guild.premiumTier} | Weekly raids: ${guild.weeklyRaidCount}/5 | Expires: ${guild.premiumExpiresAt?.toISOString() ?? 'n/a'}${RESET}`);

  // Single scenario mode
  if (scenarioName) {
    const scenario = scenarios.find((s) => s.name === scenarioName);
    if (!scenario) {
      console.error(`${RED}Unknown scenario: ${scenarioName}${RESET}`);
      console.error(`Available: ${scenarios.map((s) => s.name).join(', ')}`);
      process.exit(1);
    }
    await runScenario(scenario, guildId);
    return;
  }

  // Interactive menu loop
  while (true) {
    showMenu(guildId);
    const choice = await ask(`\n  ${BOLD}Choose scenario:${RESET} `);

    if (choice === '0' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log(`\n${DIM}Bye!${RESET}`);
      break;
    }

    const index = parseInt(choice, 10) - 1;
    const scenario = scenarios[index] ?? scenarios.find((s) => s.name === choice);

    if (!scenario) {
      console.log(`${RED}Invalid choice. Enter a number 1-${scenarios.length} or scenario name.${RESET}`);
      continue;
    }

    await runScenario(scenario, guildId);
  }
}

main()
  .catch((err) => {
    console.error(`${RED}Fatal error:${RESET}`, err);
    process.exit(1);
  })
  .finally(async () => {
    rl.close();
    await prisma.$disconnect();
  });
