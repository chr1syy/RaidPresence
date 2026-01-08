export type SupportedLanguage = 'en' | 'de';

interface Translations {
  // Raid embed
  raidEvent: string;
  dateAndTime: string;
  composition: string;
  attending: string;
  optedOut: string;
  noOneAttending: string;
  noOneOptedOut: string;
  raidId: string;

  // Composition labels
  tank: string;
  heal: string;
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
  setClassSpec: string;

  // Success messages
  raidCreatedSuccess: string;
  raidDeletedSuccess: string;

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
}

const translations: Record<SupportedLanguage, Translations> = {
  en: {
    // Raid embed
    raidEvent: 'Raid Event',
    dateAndTime: 'Date & Time',
    composition: 'Composition',
    attending: 'Attending',
    optedOut: 'Opted Out',
    noOneAttending: 'No one attending yet',
    noOneOptedOut: 'No one opted out',
    raidId: 'Raid ID',

    // Composition labels
    tank: 'Tank',
    heal: 'Heal',
    melee: 'Melee',
    ranged: 'Ranged',
    noClass: 'No Class',

    // Class/spec
    noClassSet: 'No class set',

    // Countdown
    countdownIn: 'in',
    days: 'd',
    hours: 'h',
    minutes: 'm',

    // Buttons
    optOut: 'Opt Out',
    optIn: 'Opt In',
    setClassSpec: 'Set Class/Spec',

    // Success messages
    raidCreatedSuccess: 'Raid "{title}" created successfully with {count} members!',
    raidDeletedSuccess: 'Raid "{title}" has been deleted.',

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
  },

  de: {
    // Raid embed
    raidEvent: 'Raid Event',
    dateAndTime: 'Datum & Uhrzeit',
    composition: 'Zusammensetzung',
    attending: 'Anwesend',
    optedOut: 'Abgemeldet',
    noOneAttending: 'Noch niemand angemeldet',
    noOneOptedOut: 'Niemand abgemeldet',
    raidId: 'Raid ID',

    // Composition labels
    tank: 'Tank',
    heal: 'Heiler',
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
    setClassSpec: 'Klasse/Spezialisierung',

    // Success messages
    raidCreatedSuccess: 'Raid "{title}" erfolgreich erstellt mit {count} Mitgliedern!',
    raidDeletedSuccess: 'Raid "{title}" wurde gelöscht.',

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
