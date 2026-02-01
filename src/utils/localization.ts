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
}

const translations: Record<SupportedLanguage, Translations> = {
  en: {
    // Raid embed
    raidEvent: 'Raid Event',
    dateAndTime: 'Date & Time',
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
  },

  de: {
    // Raid embed
    raidEvent: 'Raid Event',
    dateAndTime: 'Datum & Uhrzeit',
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

    // Raid reminder
    reminderTitle: '🔔 Raid-Erinnerung',
    reminderMessage: 'Der Raid **{title}** beginnt <t:{timestamp}:R>!\n\nBitte bestätige deine Teilnahme, falls du es noch nicht getan hast.',
  },
};

export function getTranslations(language: string): Translations {
  const lang = (language === 'de' ? 'de' : 'en') as SupportedLanguage;
  return translations[lang];
}

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
