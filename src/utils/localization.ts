export type SupportedLanguage = 'en';

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
  badgeEarned: string;

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

  // Badge system
  badgesTitle: string;
  badgesNoBadges: string;
  badgesEarnedOn: string;
  badgesAwardedBy: string;
  badgesReason: string;
  badgePerfectAttendance: string;
  badgeTankMain: string;
  badgeHealerHero: string;
  badgeDamageDealer: string;
  badgeSharpshooter: string;
  badgeAlwaysOnTime: string;
  badgeEarlyBird: string;
  badgeTeamPlayer: string;
  badgeReliableMember: string;
  badgeRisingStar: string;
  badgeVeteranRaider: string;
  badgeLeadersChoice: string;
  badgeDescPerfectAttendance: string;
  badgeDescTankMain: string;
  badgeDescHealerHero: string;
  badgeDescDamageDealer: string;
  badgeDescSharpshooter: string;
  badgeDescAlwaysOnTime: string;
  badgeDescEarlyBird: string;
  badgeDescTeamPlayer: string;
  badgeDescReliableMember: string;
  badgeDescRisingStar: string;
  badgeDescVeteranRaider: string;
  badgeDescLeadersChoice: string;

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

    // Feedback system (Phase 3)
    raidFeedbackSummary: string;
    feedbackBreakdown: string;
    commonWords: string;
    guildMorale: string;
    overallSentiment: string;
    trend: string;
    bestRaids: string;
    worstRaids: string;
    roleMorale: string;
    lastDays: string;
    noFeedback: string;
    feedbackGreat: string;
    feedbackOkay: string;
    feedbackFrustrating: string;
    trendImproving: string;
    trendStable: string;
    trendDeclining: string;
    raidFeedback: string;
    howDidRaidGo: string;
    moodScore: string;
    statusCritical: string;
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
    badgeEarned: '🎉 {playerName} earned a new badge: {badgeName}!',

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

     // Badge system
     badgesTitle: 'Badges: {player}',
     badgesNoBadges: 'No badges earned yet.',
     badgesEarnedOn: 'Earned on',
     badgesAwardedBy: 'Awarded by',
     badgesReason: 'Reason',
     badgePerfectAttendance: 'Perfect Attendance',
     badgeTankMain: 'Tank Main',
     badgeHealerHero: 'Healer Hero',
     badgeDamageDealer: 'Damage Dealer',
     badgeSharpshooter: 'Sharpshooter',
     badgeAlwaysOnTime: 'Always On Time',
     badgeEarlyBird: 'Early Bird',
     badgeTeamPlayer: 'Team Player',
     badgeReliableMember: 'Reliable Member',
     badgeRisingStar: 'Rising Star',
     badgeVeteranRaider: 'Veteran Raider',
     badgeLeadersChoice: 'Leader\'s Choice',
     badgeDescPerfectAttendance: 'Attend 10 consecutive raids.',
     badgeDescTankMain: 'Attend at least 5 raids as a tank.',
     badgeDescHealerHero: 'Attend at least 5 raids as a healer.',
     badgeDescDamageDealer: 'Attend at least 5 raids as melee DPS.',
     badgeDescSharpshooter: 'Attend at least 5 raids as ranged DPS.',
     badgeDescAlwaysOnTime: 'Attend 5 recent raids without being late.',
     badgeDescEarlyBird: 'Be the first responder for a raid.',
     badgeDescTeamPlayer: 'Play 3 different roles across raids.',
     badgeDescReliableMember: 'Reach 95% attendance in the last 30 days.',
     badgeDescRisingStar: 'Improve attendance rate by 30 points.',
     badgeDescVeteranRaider: 'Attend 25 raids.',
     badgeDescLeadersChoice: 'Special badge awarded by raid leadership.',

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

    // Feedback system (Phase 3)
    raidFeedbackSummary: 'Feedback for {raid}',
    feedbackBreakdown: 'Feedback Breakdown',
    commonWords: 'Common Words',
    guildMorale: 'Guild Morale',
    overallSentiment: 'Overall Sentiment',
    trend: 'Trend',
    bestRaids: 'Best Raids',
    worstRaids: 'Worst Raids',
    roleMorale: 'Role Morale',
    lastDays: 'Last {days} days',
    noFeedback: 'No feedback yet',
    feedbackGreat: 'Great',
    feedbackOkay: 'Okay',
    feedbackFrustrating: 'Frustrating',
    trendImproving: 'Improving',
    trendStable: 'Stable',
    trendDeclining: 'Declining',
    raidFeedback: 'Raid Feedback',
    howDidRaidGo: 'How did the raid go?',
    moodScore: 'Mood Score',
    statusCritical: 'CRITICAL',
  },
};

/**
 * Gets the translations for the specified language, falling back to English if unsupported.
 */
export function getTranslations(language: string): Translations {
  return translations[language as SupportedLanguage] || translations.en;
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
