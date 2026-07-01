export type SupportedLanguage = 'en' | 'de';

interface Translations {
  // Raid embed
  raidEvent: string;
  dateAndTime: string;
  composition: string;
  attending: string;
  optedOut: string;
  runningLate: string;
  noOneAttending: string;
  noOneOptedOut: string;
  noOneRunningLate: string;
  raidId: string;
  raidStatus: string;
  totalParticipants: string;

  // Raid status labels
  statusOpen: string;
  statusClosed: string;
  statusCancelled: string;

  // Composition labels
  tank: string;
  heal: string;
  dps: string;
  melee: string;
  ranged: string;
  noClass: string;

  // Class/spec
  noClassSet: string;

  // Countdown
  countdownIn: string;
  days: string;
  hours: string;
  minutes: string;

  // Buttons
  optOut: string;
  optIn: string;
  runningLateButton: string;
  setClassSpec: string;

  // Success messages
  raidCreatedSuccess: string;
  raidDeletedSuccess: string;
  raidClosedSuccess: string;
  raidCancelledSuccess: string;
  raidReminderSent: string;
  markedAsLate: string;
  raidEditSuccess: string;

  // Clone-specific messages
  cloneRaidSuccess: string;
  cloneNoRoles: string;
  cloneDefaultTitle: string;

  // Edit-specific messages
  raidEditDateUpdated: string;
  raidEditTimeUpdated: string;
  raidEditTitleUpdated: string;
  raidEditNoChanges: string;
  raidEditClosed: string;
  raidEditCancelled: string;
  raidEditMembersScanChanged: string;

  // Error messages
  serverOnlyCommand: string;
  noPermission: string;
  invalidDateTime: string;
  raidMustBeFuture: string;
  guildNotFound: string;
  noEligibleMembers: string;
  raidNotFound: string;
  raidNotInServer: string;
  cannotSendMessage: string;
  raidIsClosed: string;
  raidIsCancelled: string;
  alreadyMarkedAsLate: string;

  // Config
  configUpdated: string;
  currentConfig: string;
  raidRoles: string;
  leaderRoles: string;
  language: string;
  notConfigured: string;

  // Raid list
  upcomingRaids: string;
  noUpcomingRaids: string;
  date: string;
  id: string;
  status: string;

  // Links
  links: string;

  // Raid reminder
  reminderTitle: string;
  reminderMessage: string;
  customMessage: string;
  optedOutPlayers: string;
  noOptedOutPlayers: string;

  // Status dashboard command
  statusTitle: string;
  statusNoUpcomingRaids: string;
  statusRoster: string;
  statusFull: string;
  statusGood: string;
  statusLow: string;
  statusTimeUntil: string;

  // Stats command
  statsRaidTitle: string;
  statsGuildTitle: string;
  statsAttendanceRate: string;
  statsAttending: string;
  statsOptedOut: string;
  statsRunningLate: string;
  statsComposition: string;
  statsClassDistribution: string;
  statsTopAttendees: string;
  statsTotalRaids: string;
  statsTotalRaiders: string;
  statsReliability: string;
  statsPeriodWeek: string;
  statsPeriodMonth: string;
  statsPeriodAll: string;
  statsNoRaidsFound: string;

   // Composition command
   compositionAnalysis: string;
   compositionActivePlayers: string;
   compositionCurrentComposition: string;
   compositionStatus: string;
   compositionRoleAnalysis: string;
   compositionPlayerSuggestions: string;
   compositionSuccessLikelihood: string;
   compositionFactors: string;
   compositionNeedMore: string;
   compositionExtraPlayers: string;
   compositionCountFine: string;
   compositionNoSuggestions: string;
   compositionAnalyzedAt: string;
    compositionTanks: string;
    compositionHealers: string;
    compositionMeleeDps: string;
    compositionRangedDps: string;
    compositionReady: string;
    compositionNeedsTanks: string;
    compositionNeedsHealers: string;
    compositionNeedsDps: string;
    compositionOverstockedTanks: string;
    compositionOverstockedHealers: string;
    compositionOverstockedDps: string;
    compositionUnknown: string;

    // Attendance command
   attendanceRecord: string;
   attendanceRaidsInvited: string;
  attendanceRaidsAttended: string;
  attendanceOptedOut: string;
  attendanceRunningLate: string;
  attendanceReliabilityScore: string;
  attendanceTrend: string;
  attendanceMainRole: string;
  attendanceAltRoles: string;
  attendanceAvgResponseTime: string;
  attendanceRecentRaids: string;
  attendancePlayerNotFound: string;
  attendancePeriodMonth: string;
  attendancePeriodQuarter: string;
  attendancePeriodAll: string;
  attendanceNoRaids: string;
  attendanceAttended: string;
  attendanceMissed: string;

  // Raid Notes Feature (Phase 2.3)
  optoutReason: string;
  optoutReasonLabel: string;
  optoutReasonSubmitted: string;
  playerNoteAdded: string;
  raidNotes: string;
  raidNotesPlayerComments: string;
  raidNotesOptoutReasons: string;
  raidNotesNone: string;

   // Raid Archive Feature (Phase 2.4)
    archiveSearchResults: string;
    archiveSearchQuery: string;
    archiveSearchPeriod: string;
    archiveSearchNoResults: string;
    archiveSearchNone: string;
    archiveDate: string;
    archiveAttendance: string;
    archiveParticipants: string;
    archiveRaidId: string;
    archiveShowingResults: string;
    archiveFoundCount: string;
    archiveFoundCountSingular: string;
    raidArchived: string;
    archiveMovedNotification: string;
    raidRestored: string;
    archiveNotConfigured: string;
    raidAlreadyArchived: string;
    raidNotArchived: string;

    // Premium system (Phase 1.4)
    premiumRequired: string;
    premiumUpsell: string;
    premiumWeeklyLimitReached: string;
    premiumWeeklyLimitInfo: string;
    premiumTierFree: string;
    premiumTierPremium: string;
    premiumTierPro: string;
    premiumExpired: string;
    premiumAttendanceCapped: string;

    // Premium upsell embed + free-tier hint (Phase 1.5)
    premiumUpsellTitle: string;
    premiumUpsellBody: string;
    premiumUpsellCurrentPlan: string;
    premiumUpsellRequiredPlan: string;
    premiumUpsellHowTo: string;
    premiumFooterHint: string;

    // Premium trial (Phase 1.6)
    premiumTrialGranted: string;
}

/**
 * Contains all translatable strings for the application, organized by supported languages.
 * 
 * This record provides direct access to all UI text and messages in both English and German.
 * While this can be used directly for simple cases, it's recommended to use the t() function
 * for better error handling and replacement support.
 * 
 * Properties:
 *   - en: Translations - English translations for all application strings
 *   - de: Translations - German translations for all application strings
 */
const translations: Record<SupportedLanguage, Translations> = {
  en: {
    // Raid embed
    raidEvent: 'Raid Event',
    dateAndTime: '📅 🕐',
    composition: 'Composition',
    attending: 'Attending',
    optedOut: 'Opted Out',
    runningLate: 'Running Late',
    noOneAttending: 'No one attending yet',
    noOneOptedOut: 'No one opted out',
    noOneRunningLate: 'No one running late',
    raidId: 'Raid ID',
    raidStatus: 'Status',
    totalParticipants: 'Total Participants',

    // Raid status labels
    statusOpen: '🟢 Open',
    statusClosed: '🔴 Closed',
    statusCancelled: '❌ Cancelled',

    // Composition labels
    tank: 'Tank',
    heal: 'Heal',
    dps: 'DPS',
    melee: 'Melee',
    ranged: 'Ranged',
    noClass: 'No Class',

    // Class/spec
    noClassSet: 'No Class',

    // Countdown
    countdownIn: 'in',
    days: 'd',
    hours: 'h',
    minutes: 'm',

    // Buttons
    optOut: 'Opt Out',
    optIn: 'Opt In',
    runningLateButton: 'Running Late',
    setClassSpec: 'Set Class/Spec',

    // Success messages
    raidCreatedSuccess: 'Raid "{title}" created successfully with {count} members!',
    raidDeletedSuccess: 'Raid "{title}" has been deleted.',
    raidClosedSuccess: 'Raid "{title}" has been closed. No further changes allowed.',
    raidCancelledSuccess: 'Raid "{title}" has been cancelled.',
    raidReminderSent: 'Reminder sent for raid "{title}"!',
    markedAsLate: 'You are now marked as running late for this raid.',
    raidEditSuccess: 'Raid updated successfully!',

    // Clone-specific messages
    cloneRaidSuccess: 'Cloned "{title}" to {date} with {count} members!',
    cloneNoRoles: 'Source raid has no roles configured. Cannot clone.',
    cloneDefaultTitle: 'Cloned Raid',

    // Edit-specific messages
    raidEditDateUpdated: 'Date/time updated to ${date}',
    raidEditTimeUpdated: 'Time updated to ${time}',
    raidEditTitleUpdated: 'Title updated to "${title}"',
    raidEditNoChanges: 'No changes requested. Please specify at least one new value that differs from current.',
    raidEditClosed: 'Cannot edit a closed raid. Please contact an admin if you need to modify it.',
    raidEditCancelled: 'Cannot edit a cancelled raid. Please contact an admin if you need to modify it.',
    raidEditMembersScanChanged: 'Roster updated: ${addedCount} added, ${removedCount} removed',

    // Error messages
    serverOnlyCommand: 'This command can only be used in a server!',
    noPermission: 'You do not have permission to {action}. Ask your server admin to configure raid leader roles.',
    invalidDateTime: 'Invalid date or time format. Use YYYY-MM-DD for date and HH:MM for time.',
    raidMustBeFuture: 'Raid date must be in the future!',
    guildNotFound: 'Guild not found in database. Please try again.',
    noEligibleMembers: 'No eligible members found for this raid. Check your RAID_ROLES configuration.',
    raidNotFound: 'Raid not found.',
    raidNotInServer: 'This raid does not belong to this server.',
    cannotSendMessage: 'Cannot send message to this channel type.',
    raidIsClosed: 'This raid is closed. No further changes allowed.',
    raidIsCancelled: 'This raid has been cancelled.',
    alreadyMarkedAsLate: 'You are already marked as running late.',

    // Config
    configUpdated: 'Configuration updated successfully!',
    currentConfig: 'Current Configuration',
    raidRoles: 'Raid Roles',
    leaderRoles: 'Leader Roles',
    language: 'Language',
    notConfigured: 'Not configured',

    // Raid list
    upcomingRaids: 'Upcoming Raids',
    noUpcomingRaids: 'No upcoming raids found.',
    date: 'Date',
    id: 'ID',
    status: 'Status',

    // Links
    links: 'Links',

    // Raid reminder
    reminderTitle: '🔔 Raid Reminder',
    reminderMessage: 'The raid **{title}** starts <t:{timestamp}:R>!\n\nPlease confirm your attendance if you haven\'t already.',
    customMessage: 'Message from Raid Leader',
    optedOutPlayers: 'Currently Opted Out',
    noOptedOutPlayers: 'No one has opted out.',

    // Status dashboard command
    statusTitle: 'Upcoming Raids',
    statusNoUpcomingRaids: 'No upcoming raids scheduled.',
    statusRoster: 'Roster',
    statusFull: 'FULL',
    statusGood: 'GOOD',
    statusLow: 'LOW',
    statusTimeUntil: 'Time Until',

    // Stats command
    statsRaidTitle: 'Statistics: {title}',
    statsGuildTitle: 'Guild Statistics ({period})',
    statsAttendanceRate: 'Attendance Rate',
    statsAttending: 'Attending',
    statsOptedOut: 'Opted Out',
    statsRunningLate: 'Running Late',
    statsComposition: 'Role Composition',
    statsClassDistribution: 'Class Distribution',
    statsTopAttendees: 'Top Attendees',
    statsTotalRaids: 'Total Raids',
    statsTotalRaiders: 'Total Raiders',
    statsReliability: 'Reliability',
    statsPeriodWeek: 'Last 7 days',
    statsPeriodMonth: 'Last 30 days',
    statsPeriodAll: 'All time',
     statsNoRaidsFound: 'No raids found for this period.',

      // Composition command
      compositionAnalysis: 'Composition Analysis: {raid}',
      compositionActivePlayers: 'Active Players',
      compositionCurrentComposition: 'Current Composition',
      compositionStatus: 'Status',
      compositionRoleAnalysis: 'Role Analysis',
      compositionPlayerSuggestions: 'Player Suggestions',
      compositionSuccessLikelihood: 'Success Likelihood',
      compositionFactors: 'Factors',
      compositionNeedMore: 'Need {count} more {role}(s)',
      compositionExtraPlayers: '{count} extra {role}(s)',
      compositionCountFine: '{role} count is fine',
      compositionNoSuggestions: 'No suggestions available',
      compositionAnalyzedAt: 'Analyzed at',
       compositionTanks: 'Tanks',
       compositionHealers: 'Healers',
       compositionMeleeDps: 'Melee DPS',
       compositionRangedDps: 'Ranged DPS',
       compositionReady: '✅ Raid composition is ready!',
       compositionNeedsTanks: '❌ Need more tanks',
       compositionNeedsHealers: '❌ Need more healers',
       compositionNeedsDps: '❌ Need more DPS',
       compositionOverstockedTanks: '⚠️ Too many tanks',
       compositionOverstockedHealers: '⚠️ Too many healers',
       compositionOverstockedDps: '⚠️ Too many DPS',
       compositionUnknown: 'Status unknown',

      // Attendance command
     attendanceRecord: 'Attendance Record: {player}',
    attendanceRaidsInvited: 'Raids Invited',
    attendanceRaidsAttended: 'Raids Attended',
    attendanceOptedOut: 'Opted Out',
    attendanceRunningLate: 'Running Late',
    attendanceReliabilityScore: 'Reliability Score',
    attendanceTrend: 'Trend',
    attendanceMainRole: 'Main Role',
    attendanceAltRoles: 'Alt Roles',
    attendanceAvgResponseTime: 'Avg Response Time',
    attendanceRecentRaids: 'Recent Raids',
    attendancePlayerNotFound: 'Player {player} has no raid history in this server.',
    attendancePeriodMonth: 'Last 30 days',
    attendancePeriodQuarter: 'Last 90 days',
    attendancePeriodAll: 'All time',
     attendanceNoRaids: 'No raids found for this period.',
     attendanceAttended: 'Attended',
     attendanceMissed: 'Missed',

      // Raid Notes Feature (Phase 2.3)
      optoutReason: 'Opt Out Reason',
      optoutReasonLabel: 'Why are you opting out? (optional)',
      optoutReasonSubmitted: '✅ You have opted out of this raid.',
      playerNoteAdded: 'Note added',
      raidNotes: 'Raid Notes',
      raidNotesPlayerComments: 'Player Comments',
      raidNotesOptoutReasons: 'Opt-Out Reasons',
      raidNotesNone: 'No notes or comments for this raid.',

       // Raid Archive Feature (Phase 2.4)
        archiveSearchResults: 'Archive Search Results',
        archiveSearchQuery: 'Query',
        archiveSearchPeriod: 'Period',
        archiveSearchNoResults: 'No archived raids match your search.',
        archiveSearchNone: 'No results',
        archiveDate: 'Date',
        archiveAttendance: 'Attendance',
        archiveParticipants: 'Participants',
        archiveRaidId: 'Raid ID',
        archiveShowingResults: 'Showing 10 of {total} results. Use more specific filters to narrow down.',
         archiveFoundCount: '{count} archived raids found',
         archiveFoundCountSingular: '1 archived raid found',
         raidArchived: 'Raid Archived',
        archiveMovedNotification: 'has been moved to {channel}',
        raidRestored: 'Raid Restored',
        archiveNotConfigured: 'Archive channel not configured. Use `/config archive-channel` first.',
        raidAlreadyArchived: 'This raid is already archived.',
        raidNotArchived: 'This raid is not archived.',

        // Premium system (Phase 1.4)
        premiumRequired: 'This feature requires {tier}.',
        premiumUpsell: 'Upgrade to {tier} to unlock {feature}. Visit the App Directory or Server Settings → Subscriptions to subscribe.',
        premiumWeeklyLimitReached: 'Weekly raid limit reached ({count}/{max}). Resets {resetDate}. Upgrade to Premium for unlimited raids.',
        premiumWeeklyLimitInfo: 'You have {remaining} raids left this week.',
        premiumTierFree: 'Free',
        premiumTierPremium: 'Premium',
        premiumTierPro: 'Pro',
        premiumExpired: 'Your {tier} subscription has expired.',
        premiumAttendanceCapped: 'Showing last {count} raids. Upgrade to Premium for full history.',

        // Premium upsell embed + free-tier hint (Phase 1.5)
        premiumUpsellTitle: '💎 {feature} is a {tier} feature',
        premiumUpsellBody: 'Unlock **{feature}** — and every other {tier} perk — for your whole server.',
        premiumUpsellCurrentPlan: 'Your Plan',
        premiumUpsellRequiredPlan: 'Required Plan',
        premiumUpsellHowTo: 'Tap the bot\'s profile → **Store**, or open **Server Settings → Subscriptions** to upgrade.',
        premiumFooterHint: '-# 💎 Upgrade to Premium to unlock archives, analytics & unlimited raids.',

        // Premium trial (Phase 1.6)
        premiumTrialGranted: '🎁 **Your 14-day {tier} trial is active!** Enjoy unlimited raids, archives and analytics — no card required. It ends automatically, nothing to cancel.',
    },

  de: {
    // Raid embed
    raidEvent: 'Raid Event',
    dateAndTime: '📅 🕐',
    composition: 'Zusammensetzung',
    attending: 'Anwesend',
    optedOut: 'Abgemeldet',
    runningLate: 'Verspätet',
    noOneAttending: 'Noch niemand angemeldet',
    noOneOptedOut: 'Niemand abgemeldet',
    noOneRunningLate: 'Niemand verspätet',
    raidId: 'Raid ID',
    raidStatus: 'Status',
    totalParticipants: 'Teilnehmer insgesamt',

    // Raid status labels
    statusOpen: '🟢 Offen',
    statusClosed: '🔴 Geschlossen',
    statusCancelled: '❌ Abgesagt',

    // Composition labels
    tank: 'Tank',
    heal: 'Heiler',
    dps: 'DPS',
    melee: 'Nahkampf',
    ranged: 'Fernkampf',
    noClass: 'Keine Klasse',

    // Class/spec
    noClassSet: 'Keine Klasse gesetzt',

    // Countdown
    countdownIn: 'in',
    days: 'T',
    hours: 'Std',
    minutes: 'Min',

    // Buttons
    optOut: 'Abmelden',
    optIn: 'Anmelden',
    runningLateButton: 'Verspätet',
    setClassSpec: 'Klasse/Spezialisierung',

    // Success messages
    raidCreatedSuccess: 'Raid "{title}" erfolgreich erstellt mit {count} Mitgliedern!',
    raidDeletedSuccess: 'Raid "{title}" wurde gelöscht.',
    raidClosedSuccess: 'Raid "{title}" wurde geschlossen. Keine weiteren Änderungen möglich.',
    raidCancelledSuccess: 'Raid "{title}" wurde abgesagt.',
    raidReminderSent: 'Erinnerung für Raid "{title}" gesendet!',
    markedAsLate: 'Du bist jetzt als verspätet für diesen Raid markiert.',
    raidEditSuccess: 'Raid erfolgreich aktualisiert!',

    // Clone-specific messages
    cloneRaidSuccess: '"{title}" geklont auf {date} mit {count} Mitgliedern!',
    cloneNoRoles: 'Quell-Raid hat keine Rollen konfiguriert. Klonen nicht möglich.',
    cloneDefaultTitle: 'Geklonter Raid',

    // Edit-specific messages
    raidEditDateUpdated: 'Datum/Uhrzeit aktualisiert auf ${date}',
    raidEditTimeUpdated: 'Uhrzeit aktualisiert auf ${time}',
    raidEditTitleUpdated: 'Titel aktualisiert auf "${title}"',
    raidEditNoChanges: 'Keine Änderungen angefordert. Bitte gib mindestens einen neuen Wert an, der sich vom aktuellen unterscheidet.',
    raidEditClosed: 'Kann einen geschlossenen Raid nicht bearbeiten. Kontaktiere einen Admin, wenn du ihn ändern möchtest.',
    raidEditCancelled: 'Kann einen abgesagten Raid nicht bearbeiten. Kontaktiere einen Admin, wenn du ihn ändern möchtest.',
    raidEditMembersScanChanged: 'Roster aktualisiert: ${addedCount} hinzugefügt, ${removedCount} entfernt',

    // Error messages
    serverOnlyCommand: 'Dieser Befehl kann nur auf einem Server verwendet werden!',
    noPermission: 'Du hast keine Berechtigung, um {action}. Frage deinen Server-Admin, Raid-Leader-Rollen zu konfigurieren.',
    invalidDateTime: 'Ungültiges Datum oder Zeitformat. Verwende YYYY-MM-DD für das Datum und HH:MM für die Uhrzeit.',
    raidMustBeFuture: 'Das Raid-Datum muss in der Zukunft liegen!',
    guildNotFound: 'Server nicht in der Datenbank gefunden. Bitte versuche es erneut.',
    noEligibleMembers: 'Keine berechtigten Mitglieder für diesen Raid gefunden. Überprüfe deine RAID_ROLES Konfiguration.',
    raidNotFound: 'Raid nicht gefunden.',
    raidNotInServer: 'Dieser Raid gehört nicht zu diesem Server.',
    cannotSendMessage: 'Kann keine Nachricht in diesem Kanaltyp senden.',
    raidIsClosed: 'Dieser Raid ist geschlossen. Keine weiteren Änderungen möglich.',
    raidIsCancelled: 'Dieser Raid wurde abgesagt.',
    alreadyMarkedAsLate: 'Du bist bereits als verspätet markiert.',

    // Config
    configUpdated: 'Konfiguration erfolgreich aktualisiert!',
    currentConfig: 'Aktuelle Konfiguration',
    raidRoles: 'Raid-Rollen',
    leaderRoles: 'Leader-Rollen',
    language: 'Sprache',
    notConfigured: 'Nicht konfiguriert',

    // Raid list
    upcomingRaids: 'Anstehende Raids',
    noUpcomingRaids: 'Keine anstehenden Raids gefunden.',
    date: 'Datum',
    id: 'ID',
    status: 'Status',

    // Links
    links: 'Verknüpfungen',

    // Raid reminder
    reminderTitle: '🔔 Raid-Erinnerung',
    reminderMessage: 'Der Raid **{title}** beginnt <t:{timestamp}:R>!\n\nBitte bestätige deine Teilnahme, falls du es noch nicht getan hast.',
    customMessage: 'Nachricht vom Raidleiter',
    optedOutPlayers: 'Derzeit abgemeldet',
    noOptedOutPlayers: 'Niemand hat sich abgemeldet.',

    // Status dashboard command
    statusTitle: 'Anstehende Raids',
    statusNoUpcomingRaids: 'Keine anstehenden Raids geplant.',
    statusRoster: 'Aufstellung',
    statusFull: 'VOLL',
    statusGood: 'GUT',
    statusLow: 'NIEDRIG',
    statusTimeUntil: 'Zeit bis',

    // Stats command
    statsRaidTitle: 'Statistiken: {title}',
    statsGuildTitle: 'Server-Statistiken ({period})',
    statsAttendanceRate: 'Teilnahmequote',
    statsAttending: 'Anwesend',
    statsOptedOut: 'Abgemeldet',
    statsRunningLate: 'Verspätet',
    statsComposition: 'Rollenzusammensetzung',
    statsClassDistribution: 'Klassenverteilung',
    statsTopAttendees: 'Top-Teilnehmer',
    statsTotalRaids: 'Raids insgesamt',
    statsTotalRaiders: 'Spieler insgesamt',
    statsReliability: 'Zuverlässigkeit',
    statsPeriodWeek: 'Letzte 7 Tage',
    statsPeriodMonth: 'Letzte 30 Tage',
    statsPeriodAll: 'Gesamt',
     statsNoRaidsFound: 'Keine Raids für diesen Zeitraum gefunden.',

      // Composition command
      compositionAnalysis: 'Zusammensetzungsanalyse: {raid}',
      compositionActivePlayers: 'Aktive Spieler',
      compositionCurrentComposition: 'Aktuelle Zusammensetzung',
      compositionStatus: 'Status',
      compositionRoleAnalysis: 'Rollenanalyse',
      compositionPlayerSuggestions: 'Spielervorschläge',
      compositionSuccessLikelihood: 'Erfolgschance',
      compositionFactors: 'Faktoren',
      compositionNeedMore: 'Benötige {count} mehr {role}',
      compositionExtraPlayers: '{count} extra {role}',
      compositionCountFine: '{role} Anzahl ist in Ordnung',
      compositionNoSuggestions: 'Keine Vorschläge verfügbar',
      compositionAnalyzedAt: 'Analysiert um',
       compositionTanks: 'Tanks',
       compositionHealers: 'Heiler',
       compositionMeleeDps: 'Nahkampf DPS',
       compositionRangedDps: 'Fernkampf DPS',
       compositionReady: '✅ Raid-Zusammensetzung ist bereit!',
       compositionNeedsTanks: '❌ Mehr Tanks erforderlich',
       compositionNeedsHealers: '❌ Mehr Heiler erforderlich',
       compositionNeedsDps: '❌ Mehr DPS erforderlich',
       compositionOverstockedTanks: '⚠️ Zu viele Tanks',
       compositionOverstockedHealers: '⚠️ Zu viele Heiler',
       compositionOverstockedDps: '⚠️ Zu viel DPS',
       compositionUnknown: 'Status unbekannt',

      // Attendance command
     attendanceRecord: 'Anwesenheit: {player}',
    attendanceRaidsInvited: 'Raids eingeladen',
    attendanceRaidsAttended: 'Raids teilgenommen',
    attendanceOptedOut: 'Abgemeldet',
    attendanceRunningLate: 'Verspätet',
    attendanceReliabilityScore: 'Zuverlässigkeit',
    attendanceTrend: 'Trend',
    attendanceMainRole: 'Hauptrolle',
    attendanceAltRoles: 'Nebenrollen',
    attendanceAvgResponseTime: 'Durchschn. Antwortzeit',
    attendanceRecentRaids: 'Letzte Raids',
    attendancePlayerNotFound: 'Spieler {player} hat keine Raid-Historie auf diesem Server.',
    attendancePeriodMonth: 'Letzte 30 Tage',
    attendancePeriodQuarter: 'Letzte 90 Tage',
    attendancePeriodAll: 'Gesamt',
     attendanceNoRaids: 'Keine Raids für diesen Zeitraum gefunden.',
     attendanceAttended: 'Teilgenommen',
     attendanceMissed: 'Verpasst',

      // Raid Notes Feature (Phase 2.3)
       optoutReason: 'Abmeldungsgrund',
       optoutReasonLabel: 'Warum meldest du dich ab? (optional)',
       optoutReasonSubmitted: '✅ Du hast dich von diesem Raid abgemeldet.',
       playerNoteAdded: 'Notiz hinzugefügt',
       raidNotes: 'Raid-Notizen',
       raidNotesPlayerComments: 'Spieler-Kommentare',
       raidNotesOptoutReasons: 'Abmeldungsgründe',
       raidNotesNone: 'Keine Notizen oder Kommentare für diesen Raid.',

        // Raid Archive Feature (Phase 2.4)
        archiveSearchResults: 'Archiv-Suchergebnisse',
        archiveSearchQuery: 'Abfrage',
        archiveSearchPeriod: 'Zeitraum',
        archiveSearchNoResults: 'Keine archivierten Raids entsprechen deiner Suche.',
        archiveSearchNone: 'Keine Ergebnisse',
        archiveDate: 'Datum',
        archiveAttendance: 'Teilnahme',
        archiveParticipants: 'Teilnehmer',
        archiveRaidId: 'Raid ID',
          archiveShowingResults: 'Zeige 10 von {total} Ergebnissen. Verwende spezifischere Filter zum Eingrenzen.',
          archiveFoundCount: '{count} archivierte Raids gefunden',
          archiveFoundCountSingular: '1 archivierter Raid gefunden',
          raidArchived: 'Raid archiviert',
         archiveMovedNotification: 'wurde zu {channel} verschoben',
         raidRestored: 'Raid wiederhergestellt',
        archiveNotConfigured: 'Archiv-Kanal nicht konfiguriert. Verwende zuerst `/config archive-channel`.',
        raidAlreadyArchived: 'Dieser Raid ist bereits archiviert.',
        raidNotArchived: 'Dieser Raid ist nicht archiviert.',

        // Premium system (Phase 1.4)
        premiumRequired: 'Diese Funktion erfordert {tier}.',
        premiumUpsell: 'Upgrade auf {tier}, um {feature} freizuschalten. Besuche das App-Verzeichnis oder Servereinstellungen → Abonnements.',
        premiumWeeklyLimitReached: 'Wöchentliches Raid-Limit erreicht ({count}/{max}). Setzt zurück am {resetDate}. Upgrade auf Premium für unbegrenzte Raids.',
        premiumWeeklyLimitInfo: 'Du hast noch {remaining} Raids diese Woche übrig.',
        premiumTierFree: 'Free',
        premiumTierPremium: 'Premium',
        premiumTierPro: 'Pro',
        premiumExpired: 'Dein {tier}-Abonnement ist abgelaufen.',
        premiumAttendanceCapped: 'Zeige die letzten {count} Raids. Upgrade auf Premium für die vollständige Historie.',

        // Premium upsell embed + free-tier hint (Phase 1.5)
        premiumUpsellTitle: '💎 {feature} ist eine {tier}-Funktion',
        premiumUpsellBody: 'Schalte **{feature}** – und alle weiteren {tier}-Vorteile – für deinen ganzen Server frei.',
        premiumUpsellCurrentPlan: 'Dein Plan',
        premiumUpsellRequiredPlan: 'Benötigter Plan',
        premiumUpsellHowTo: 'Tippe auf das Bot-Profil → **Shop**, oder öffne **Servereinstellungen → Abonnements**, um zu upgraden.',
        premiumFooterHint: '-# 💎 Upgrade auf Premium für Archive, Analysen & unbegrenzte Raids.',

        // Premium trial (Phase 1.6)
        premiumTrialGranted: '🎁 **Deine 14-tägige {tier}-Testphase ist aktiv!** Genieße unbegrenzte Raids, Archive und Analysen – ohne Kreditkarte. Sie endet automatisch, nichts zu kündigen.',
    },
};

/**
 * Returns the translation object for the specified language, defaulting to English if the language is not supported.
 * 
 * This function provides access to all localized strings for the application, supporting both English ('en') and German ('de').
 * If an unsupported language is provided, it will fall back to English translations.
 * 
 * Parameters:
 *   - language: string - The language code to retrieve translations for ('en' or 'de')
 * 
 * Returns:
 *   Translations - The complete translation object containing all UI strings and messages for the specified language
 * 
 * Example:
 *   const english = getTranslations('en'); // Returns English translations
 *   const german = getTranslations('de'); // Returns German translations
 *   const fallback = getTranslations('fr'); // Returns English translations (fallback)
 */
export function getTranslations(language: string): Translations {
  const lang = (language === 'de' ? 'de' : 'en') as SupportedLanguage;
  return translations[lang];
}

/**
 * Translates a key to the specified language with optional placeholder replacements.
 * 
 * This function provides a convenient way to get localized text strings with support for
 * dynamic content replacement. It automatically handles language fallback to English if
 * an unsupported language is provided.
 * 
 * Parameters:
 *   - language: string - The language code to use for translation ('en' or 'de')
 *   - key: keyof Translations - The translation key to look up from the Translations interface
 *   - replacements: Record<string, string | number> - Optional object containing placeholder replacements (optional)
 * 
 * Returns:
 *   string - The translated string with any replacements applied
 * 
 * Example:
 *   const message = t('en', 'raidCreatedSuccess', { title: 'Molten Core', count: 25 });
 *   // Returns: 'Raid "Molten Core" created successfully with 25 members!'
 *   
 *   const germanMsg = t('de', 'raidCreatedSuccess', { title: 'Geschmolzener Kern', count: 40 });
 *   // Returns: 'Raid "Geschmolzener Kern" erfolgreich erstellt mit 40 Mitgliedern!'
 */
export function t(language: string, key: keyof Translations, replacements?: Record<string, string | number>): string {
  const trans = getTranslations(language);
  let text = trans[key];

  if (replacements) {
    Object.entries(replacements).forEach(([key, value]) => {
      text = text.replace(`{${key}}`, String(value));
    });
  }

  return text;
}
