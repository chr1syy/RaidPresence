import { Client, GatewayIntentBits, Collection, Events, ActivityType, MessageFlags } from 'discord.js';
import { config } from 'dotenv';
import { BotClient, Command } from './types';
import prisma from './database/client';
import { startRaidScheduler } from './utils/raidScheduler';
import { registerEntitlementHandlers } from './events/entitlementHandler';
import { syncEntitlementsOnStartup, grantTrialIfEligible, TRIAL_DAYS } from './services/entitlementService';
import { localeToLanguage } from './utils/localization';
import { buildWelcomeMessage } from './utils/welcomeEmbed';
import { getDefaultTeam } from './services/teamService';
import { TEAM_OPTION_NAME } from './utils/teamContext';
import { runStartupTrialBackfill } from './scripts/backfillTrials';
import { logInteraction, commandLabel } from './utils/interactionLog';

config();

/** Commands that expose the shared, autocompleted `team` option. */
const TEAM_AUTOCOMPLETE_COMMANDS = new Set(['raid', 'stats', 'team']);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildIntegrations,
  ],
}) as BotClient;

client.commands = new Collection<string, Command>();

// Import commands dynamically
import raidCommand from './commands/raid';
import configCommand from './commands/config';
import setupCommand from './commands/setup';
import statsCommand from './commands/stats';
import teamCommand from './commands/team';
client.commands.set(raidCommand.data.name, raidCommand);
client.commands.set(configCommand.data.name, configCommand);
client.commands.set(setupCommand.data.name, setupCommand);
client.commands.set(statsCommand.data.name, statsCommand);
client.commands.set(teamCommand.data.name, teamCommand);

// Ready event
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Bot is ready! Logged in as ${c.user.tag}`);
  console.log(`📊 Serving ${c.guilds.cache.size} guild(s)`);

  // Set bot presence
  c.user?.setPresence({
    activities: [
      {
        name: 'raidpresence.dev',
        type: ActivityType.Watching,
      }
    ],
    status: 'online',
  });

  // Sync guild data
  for (const [guildId, guild] of c.guilds.cache) {
    // No timezone detection: Discord's `preferredLocale` is a language setting, not
    // a location, so deriving a zone from it produced confident nonsense. New guilds
    // start at UTC and set their zone explicitly via `/config timezone`.
    await prisma.guild.upsert({
      where: { id: guildId },
      update: {
        name: guild.name,
      },
      create: {
        id: guildId,
        name: guild.name,
        raidRoles: process.env.RAID_ROLES || '',
        raidLeaderRoles: process.env.RAID_LEADER_ROLES || '',
      },
    });

    // Make sure every guild owns its default "Main" team. Never abort startup
    // over this — the team is created lazily on first raid creation anyway.
    try {
      await getDefaultTeam(guildId);
    } catch (error) {
      console.error(`❌ Failed to ensure default team for ${guild.name}:`, error);
    }

  }

  console.log('✅ Guild data synchronized');

  // Start the raid scheduler for auto-closing expired raids
  startRaidScheduler(c);

  // Register entitlement handlers (Premium system)
  registerEntitlementHandlers(c);

  // Sync existing entitlements from Discord
  const entitlementSync = await syncEntitlementsOnStartup(c);

  // Backfill the one-time Premium trial for guilds that installed the bot before the
  // trial existed — they never fired guildCreate on an eligible code path. Runs last so
  // the guild rows and the Discord entitlement sync above are already settled: a guild
  // that just got its paid entitlement written must not be handed a trial instead.
  //
  // This stays in startup permanently and needs no env flag or marker table: it is
  // idempotent by construction. Once the first run has granted the trials, the candidate
  // query returns nothing and every later boot is a no-op with granted=0 — and even a
  // stale candidate is rejected atomically by the WHERE clause inside grantTrialIfEligible.
  // Awaited (nothing after it depends on it), and gated on a clean entitlement sync so a
  // paying guild whose entitlementId failed to write is never mistaken for a FREE trial
  // candidate. The guard swallows both the skip and any backfill error — see
  // runStartupTrialBackfill() — so startup is never blocked.
  await runStartupTrialBackfill(entitlementSync);
});

// Interaction handler
//
// Every interaction except autocomplete emits one structured line via logInteraction()
// so activity is visible in stdout without DB queries. Autocomplete is excluded on
// purpose: it fires on every keystroke and would drown out the signal.
client.on(Events.InteractionCreate, async (interaction) => {
  const startedAt = Date.now();

  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    const label = commandLabel(interaction);

    if (!command) {
      console.error(`Command ${interaction.commandName} not found`);
      logInteraction({
        kind: 'CMD',
        guildId: interaction.guildId,
        name: label,
        ok: false,
        ms: Date.now() - startedAt,
        err: 'CommandNotFound',
      });
      return;
    }

    try {
      await command.execute(interaction);
      logInteraction({
        kind: 'CMD',
        guildId: interaction.guildId,
        name: label,
        ok: true,
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      // The structured line carries the error class; the stack trace stays in the
      // existing console.error so debugging information is not lost.
      logInteraction({
        kind: 'CMD',
        guildId: interaction.guildId,
        name: label,
        ok: false,
        ms: Date.now() - startedAt,
        err: error,
      });
      console.error('Error executing command:', error);

      // `as const` keeps `flags` from widening to the whole MessageFlags enum, which
      // discord.js's reply options reject.
      const errorMessage = {
        content: '❌ There was an error executing this command!',
        flags: MessageFlags.Ephemeral,
      } as const;

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  } else if (interaction.isAutocomplete()) {
    // Shared `team` option autocomplete — every team-aware command uses the same handler.
    const focused = interaction.options.getFocused(true);

    if (
      TEAM_AUTOCOMPLETE_COMMANDS.has(interaction.commandName) &&
      focused.name === TEAM_OPTION_NAME
    ) {
      try {
        const { teamAutocomplete } = await import('./utils/teamContext');
        await teamAutocomplete(interaction);
      } catch (error) {
        console.error('Error handling team autocomplete:', error);
      }
    } else if (interaction.commandName === 'config' && focused.name === 'zone') {
      // IANA zone picker for `/config timezone` — see utils/timezoneHelper.ts.
      try {
        const { timezoneAutocomplete } = await import('./commands/config');
        await timezoneAutocomplete(interaction);
      } catch (error) {
        console.error('Error handling timezone autocomplete:', error);
      }
    }
  } else if (
    interaction.isButton() ||
    interaction.isModalSubmit() ||
    interaction.isStringSelectMenu() ||
    interaction.isRoleSelectMenu()
  ) {
    // Buttons carry the attendance flow (opt-in/opt-out) and the guided raid-create
    // confirmation, modals the opt-out reason and the raid-create details, string
    // selects the class/spec picks, role selects the raid roster roles. All are
    // activity signals worth logging — the guided flow especially, since the whole
    // point of #38 is being able to see where people drop out.
    const kind = interaction.isButton()
      ? 'BTN'
      : interaction.isModalSubmit()
      ? 'MODAL'
      : 'SELECT';

    try {
      const flow = await import('./events/raidCreateFlow');
      const welcome = await import('./events/welcomeFlow');

      if (interaction.isButton()) {
        if (flow.isFlowButton(interaction.customId)) {
          await flow.routeFlowButton(interaction);
        } else if (welcome.isWelcomeButton(interaction.customId)) {
          await welcome.routeWelcomeButton(interaction);
        } else {
          const buttonHandler = await import('./events/buttonHandler');
          await buttonHandler.handleButton(interaction);
        }
      } else if (interaction.isModalSubmit()) {
        if (flow.isFlowModal(interaction.customId)) {
          await flow.routeFlowModal(interaction);
        } else {
          const buttonHandler = await import('./events/buttonHandler');
          await buttonHandler.handleModalSubmit(interaction);
        }
      } else if (interaction.isRoleSelectMenu()) {
        if (flow.isFlowRoleSelect(interaction.customId)) {
          await flow.handleRoleSelect(interaction);
        }
      } else if (welcome.isWelcomeSelect(interaction.customId)) {
        await welcome.handleTimezoneSelect(interaction);
      } else {
        const selectHandler = await import('./events/selectHandler');
        await selectHandler.handleSelectMenu(interaction);
      }

      logInteraction({
        kind,
        guildId: interaction.guildId,
        name: interaction.customId,
        ok: true,
        ms: Date.now() - startedAt,
      });
    } catch (error) {
      // These handlers previously ran unguarded, so a throw surfaced only as an
      // unhandledRejection. Log it in the structured format plus the stack, then
      // rethrow so no existing behaviour changes.
      logInteraction({
        kind,
        guildId: interaction.guildId,
        name: interaction.customId,
        ok: false,
        ms: Date.now() - startedAt,
        err: error,
      });
      console.error(`Error handling ${kind} interaction:`, error);
      throw error;
    }
  }
});

// Guild join event
client.on(Events.GuildCreate, async (guild) => {
  console.log(`➕ Joined new guild: ${guild.name} (${guild.id})`);

  // Upsert so a re-install (where the guild row persists) never throws and
  // never clobbers the server's existing configuration. New guilds default to
  // UTC — see the guild-sync block above for why nothing is auto-detected.
  await prisma.guild.upsert({
    where: { id: guild.id },
    update: { name: guild.name },
    create: {
      id: guild.id,
      name: guild.name,
      raidRoles: process.env.RAID_ROLES || '',
      raidLeaderRoles: process.env.RAID_LEADER_ROLES || '',
    },
  });

  // Make sure the guild owns its default "Main" team right away.
  try {
    await getDefaultTeam(guild.id);
  } catch (error) {
    console.error(`❌ Failed to ensure default team for ${guild.name}:`, error);
  }

  // Auto-grant a one-time Premium trial (TRIAL_DAYS) to brand-new servers.
  let trialGranted = false;
  try {
    const trial = await grantTrialIfEligible(guild.id);
    trialGranted = trial.granted;
    if (trial.granted) {
      console.log(`🎁 Granted ${TRIAL_DAYS}-day Premium trial to ${guild.name} (${guild.id})`);
    }
  } catch (error) {
    console.error(`❌ Failed to grant trial for ${guild.name}:`, error);
  }

  console.log(`🌍 ${guild.name} starts on UTC. Use /config timezone to set the server's zone.`);

  // Send welcome/setup message
  try {
    const { AuditLogEvent } = await import('discord.js');

    // Localize the welcome embed to the guild's Discord locale (brand-new guilds
    // have no `language` config row yet), so a German server gets German copy.
    const language = localeToLanguage(guild.preferredLocale);
    // Buttons carry the guild id: the primary delivery path is a DM, where the
    // interaction has no guild context of its own (#39).
    const welcomeMessage = buildWelcomeMessage({
      trialGranted,
      language,
      guildId: guild.id,
    });

    // Try to find who added the bot via audit logs
    let botAdder = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.BotAdd,
        limit: 5,
      });

      const botAddEntry = auditLogs.entries.find(
        (entry) => entry.target?.id === client.user?.id
      );

      if (botAddEntry) {
        botAdder = botAddEntry.executor;
        console.log(`📋 Bot was added by: ${botAdder?.tag}`);
      }
    } catch (error) {
      console.log(`⚠️  Could not fetch audit logs for ${guild.name}`);
    }

    // Try to send DM to person who added the bot
    let messageSent = false;

    if (botAdder) {
      try {
        await botAdder.send(welcomeMessage);
        messageSent = true;
        console.log(`📨 Sent welcome DM to ${botAdder.tag} (added the bot) in ${guild.name}`);
      } catch (error) {
        console.log(`⚠️  Could not DM ${botAdder.tag} (DMs disabled or blocked)`);
      }
    }

    // Fallback: Try system channel
    if (!messageSent && guild.systemChannel && guild.systemChannel.permissionsFor(guild.members.me!)?.has('SendMessages')) {
      await guild.systemChannel.send(welcomeMessage);
      messageSent = true;
      console.log(`📨 Sent welcome message to system channel in ${guild.name}`);
    }

    // Final fallback: Try to DM the owner
    if (!messageSent) {
      try {
        const owner = await guild.fetchOwner();
        await owner.send(welcomeMessage);
        console.log(`📨 Sent welcome DM to owner of ${guild.name}`);
      } catch (error) {
        console.log(`❌ Could not send welcome message to ${guild.name}`);
      }
    }
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
});

// Login
client.login(process.env.DISCORD_TOKEN);
