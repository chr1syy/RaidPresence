/**
 * Maps Discord locales to timezone offsets (in hours)
 * This is a best-effort mapping - not all locales map perfectly to a single timezone
 */
const LOCALE_TO_TIMEZONE: Record<string, number> = {
  // Central European Time (CET/CEST - UTC+1/+2, but we use standard time UTC+1)
  'de': 1,           // German
  'de-AT': 1,        // Austrian German
  'de-CH': 1,        // Swiss German
  'fr': 1,           // French
  'nl': 1,           // Dutch
  'it': 1,           // Italian
  'pl': 1,           // Polish
  'cs': 1,           // Czech
  'hu': 1,           // Hungarian
  'hr': 1,           // Croatian
  'ro': 1,           // Romanian
  'da': 1,           // Danish
  'sv-SE': 1,        // Swedish
  'no': 1,           // Norwegian

  // UK/Ireland (GMT/BST - UTC+0/+1, we use UTC+0)
  'en-GB': 0,        // British English

  // Eastern European Time (EET - UTC+2/+3)
  'bg': 2,           // Bulgarian
  'el': 2,           // Greek
  'fi': 2,           // Finnish
  'et': 2,           // Estonian
  'lv': 2,           // Latvian
  'lt': 2,           // Lithuanian
  'uk': 2,           // Ukrainian

  // Moscow Time (MSK - UTC+3)
  'ru': 3,           // Russian

  // Eastern Time (EST/EDT - UTC-5/-4, we use UTC-5)
  'en-US': -5,       // US English (defaults to Eastern, but US has multiple zones)

  // Other major English-speaking regions
  'en-AU': 10,       // Australian English (Sydney/Melbourne - AEST/AEDT UTC+10/+11)

  // Asian timezones
  'ja': 9,           // Japanese (JST - UTC+9)
  'ko': 9,           // Korean (KST - UTC+9)
  'zh-CN': 8,        // Chinese Simplified (CST - UTC+8)
  'zh-TW': 8,        // Chinese Traditional (CST - UTC+8)

  // South American
  'pt-BR': -3,       // Brazilian Portuguese (BRT - UTC-3)
  'es-ES': 1,        // Spanish (CET - UTC+1)
  'es-MX': -6,       // Mexican Spanish (CST - UTC-6)

  // Turkish Time (TRT - UTC+3)
  'tr': 3,           // Turkish
};

/**
 * Gets a suggested timezone offset based on Discord server's preferred locale
 * Returns null if locale is not recognized or if it's ambiguous
 */
export function getTimezoneFromLocale(locale: string | null): number | null {
  if (!locale) return null;

  // Try exact match first
  if (locale in LOCALE_TO_TIMEZONE) {
    return LOCALE_TO_TIMEZONE[locale];
  }

  // Try without region code (e.g., "en-US" -> "en")
  const baseLocale = locale.split('-')[0];
  if (baseLocale in LOCALE_TO_TIMEZONE) {
    return LOCALE_TO_TIMEZONE[baseLocale];
  }

  return null;
}

/**
 * Gets a human-readable timezone name from offset
 */
export function getTimezoneName(offset: number): string {
  if (offset >= 0) {
    return `GMT+${offset}`;
  } else {
    return `GMT${offset}`;
  }
}
