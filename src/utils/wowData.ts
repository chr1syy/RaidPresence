export const WOW_CLASSES = {
  DEATH_KNIGHT: 'Death Knight',
  DEMON_HUNTER: 'Demon Hunter',
  DRUID: 'Druid',
  EVOKER: 'Evoker',
  HUNTER: 'Hunter',
  MAGE: 'Mage',
  MONK: 'Monk',
  PALADIN: 'Paladin',
  PRIEST: 'Priest',
  ROGUE: 'Rogue',
  SHAMAN: 'Shaman',
  WARLOCK: 'Warlock',
  WARRIOR: 'Warrior',
} as const;

/**
 * Maps World of Warcraft classes to their available specializations.
 * 
 * This record provides a complete mapping of all playable WoW classes to their respective specializations
 * as of the Dragonflight expansion. It's used throughout the application for class/spec selection,
 * role determination, and raid composition calculations.
 * 
 * Properties:
 *   - [className]: string[] - Array of specialization names available for the given class
 * 
 * Example:
 *   const druidSpecs = WOW_SPECS['Druid']; // ['Balance', 'Feral', 'Guardian', 'Restoration']
 *   const warriorSpecs = WOW_SPECS['Warrior']; // ['Arms', 'Fury', 'Protection']
 */
export const WOW_SPECS: Record<string, string[]> = {
  [WOW_CLASSES.DEATH_KNIGHT]: ['Blood', 'Frost', 'Unholy'],
  [WOW_CLASSES.DEMON_HUNTER]: ['Havoc', 'Vengeance', 'Devourer'],
  [WOW_CLASSES.DRUID]: ['Balance', 'Feral', 'Guardian', 'Restoration'],
  [WOW_CLASSES.EVOKER]: ['Devastation', 'Preservation', 'Augmentation'],
  [WOW_CLASSES.HUNTER]: ['Beast Mastery', 'Marksmanship', 'Survival'],
  [WOW_CLASSES.MAGE]: ['Arcane', 'Fire', 'Frost'],
  [WOW_CLASSES.MONK]: ['Brewmaster', 'Mistweaver', 'Windwalker'],
  [WOW_CLASSES.PALADIN]: ['Holy', 'Protection', 'Retribution'],
  [WOW_CLASSES.PRIEST]: ['Discipline', 'Holy', 'Shadow'],
  [WOW_CLASSES.ROGUE]: ['Assassination', 'Outlaw', 'Subtlety'],
  [WOW_CLASSES.SHAMAN]: ['Elemental', 'Enhancement', 'Restoration'],
  [WOW_CLASSES.WARLOCK]: ['Affliction', 'Demonology', 'Destruction'],
  [WOW_CLASSES.WARRIOR]: ['Arms', 'Fury', 'Protection'],
};

export const ROLE_EMOJIS = {
  TANK: '🛡️',
  HEALER: '💚',
  MELEE: '⚔️',
  RANGED: '🏹',
  DPS: '⚔️', // Keep for backward compatibility
};

export type WoWRole = 'Tank' | 'Healer' | 'Melee' | 'Ranged';

// Map of class + spec to role (Tank, Healer, Melee DPS, Ranged DPS)
const SPEC_ROLES: Record<string, WoWRole> = {
  // Death Knight
  'Death Knight-Blood': 'Tank',
  'Death Knight-Frost': 'Melee',
  'Death Knight-Unholy': 'Melee',

  // Demon Hunter
  'Demon Hunter-Havoc': 'Melee',
  'Demon Hunter-Vengeance': 'Tank',
  'Demon Hunter-Devourer': 'Ranged',

  // Druid
  'Druid-Balance': 'Ranged',
  'Druid-Feral': 'Melee',
  'Druid-Guardian': 'Tank',
  'Druid-Restoration': 'Healer',

  // Evoker
  'Evoker-Devastation': 'Ranged',
  'Evoker-Preservation': 'Healer',
  'Evoker-Augmentation': 'Ranged',

  // Hunter
  'Hunter-Beast Mastery': 'Ranged',
  'Hunter-Marksmanship': 'Ranged',
  'Hunter-Survival': 'Melee',

  // Mage
  'Mage-Arcane': 'Ranged',
  'Mage-Fire': 'Ranged',
  'Mage-Frost': 'Ranged',

  // Monk
  'Monk-Brewmaster': 'Tank',
  'Monk-Mistweaver': 'Healer',
  'Monk-Windwalker': 'Melee',

  // Paladin
  'Paladin-Holy': 'Healer',
  'Paladin-Protection': 'Tank',
  'Paladin-Retribution': 'Melee',

  // Priest
  'Priest-Discipline': 'Healer',
  'Priest-Holy': 'Healer',
  'Priest-Shadow': 'Ranged',

  // Rogue
  'Rogue-Assassination': 'Melee',
  'Rogue-Outlaw': 'Melee',
  'Rogue-Subtlety': 'Melee',

  // Shaman
  'Shaman-Elemental': 'Ranged',
  'Shaman-Enhancement': 'Melee',
  'Shaman-Restoration': 'Healer',

  // Warlock
  'Warlock-Affliction': 'Ranged',
  'Warlock-Demonology': 'Ranged',
  'Warlock-Destruction': 'Ranged',

  // Warrior
  'Warrior-Arms': 'Melee',
  'Warrior-Fury': 'Melee',
  'Warrior-Protection': 'Tank',
};

/**
 * Discord emoji symbols for each class/spec combination.
 *
 * This record provides custom Discord emoji representations for every World of Warcraft class and specialization
 * combination. These emojis are used to visually represent player specs in raid rosters, attendance lists,
 * and other Discord displays. Each emoji is a custom Discord emoji from the bot's server.
 *
 * Properties:
 *   - [className-specName]: string - Discord emoji string for the specific class/spec combination
 *
 * Example:
 *   const furyWarriorSymbol = SPEC_SYMBOLS['Warrior-Fury']; // '<:warrior_fury:1458822360781029438>'
 *   const restoDruidSymbol = SPEC_SYMBOLS['Druid-Restoration']; // '<:druid_restoration:1458821367339290645>'
 */
export const SPEC_SYMBOLS: Record<string, string> = {
  // Death Knight
  'Death Knight-Blood': '<:dk_blood:1458821143770431649>',
  'Death Knight-Frost': '<:dk_frost:1458819517122609418>',
  'Death Knight-Unholy': '<:dk_unholy:1458821179132481557>',

  // Demon Hunter
  'Demon Hunter-Havoc': '<:dh_havoc:1458824793418629160>',
  'Demon Hunter-Vengeance': '<:dh_vengeance:1458824773848006891>',
  'Demon Hunter-Devourer': '<:dh_devourer:1458826463439749233>',

  // Druid
  'Druid-Balance': '<:druid_balance:1458821219041284220>',
  'Druid-Feral': '<:druid_feral:1458821257804910735>',
  'Druid-Guardian': '<:druid_guardian:1458821305099882588>',
  'Druid-Restoration': '<:druid_restoration:1458821367339290645>',

  // Evoker
  'Evoker-Devastation': '<:evoker_devastation:1458826661989449863>',
  'Evoker-Preservation': '<:evoker_preservation:1458826690196279339>',
  'Evoker-Augmentation': '<:evoker_augmentation:1458826625121648795>',

  // Hunter
  'Hunter-Beast Mastery': '<:hunter_beastmastery:1458821413497606197>',
  'Hunter-Marksmanship': '<:hunter_marksman:1458821443155525837>',
  'Hunter-Survival': '<:hunter_survival:1458821470523232276>',

  // Mage
  'Mage-Arcane': '<:mage_arcane:1458821507240431822>',
  'Mage-Fire': '<:mage_fire:1458821531584041124>',
  'Mage-Frost': '<:mage_frost:1458821562202325170>',

  // Monk
  'Monk-Brewmaster': '<:monk_brewmaster:1458821597451386973>',
  'Monk-Mistweaver': '<:monk_mistweaver:1458821628715728998>',
  'Monk-Windwalker': '<:monk_windwalker:1458821655445897441>',

  // Paladin
  'Paladin-Holy': '<:pal_holy:1458821692653703291>',
  'Paladin-Protection': '<:pal_protection:1458821756847657063>',
  'Paladin-Retribution': '<:pal_retribution:1458821783179231423>',

  // Priest
  'Priest-Discipline': '<:priest_discipline:1458821839005417578>',
  'Priest-Holy': '<:priest_holy:1458821883838333021>',
  'Priest-Shadow': '<:priest_shadow:1458821914574454915>',

  // Rogue
  'Rogue-Assassination': '<:rogue_assa:1458821963635097620>',
  'Rogue-Outlaw': '<:rogue_combat:1458821995386110126>',
  'Rogue-Subtlety': '<:rogue_subtlety:1458822067192332456>',

  // Shaman
  'Shaman-Elemental': '<:shaman_elemental:1458822113589727386>',
  'Shaman-Enhancement': '<:shaman_enhancement:1458822161845456970>',
  'Shaman-Restoration': '<:shaman_restoration:1458822199061512318>',

  // Warlock
  'Warlock-Affliction': '<:wl_affliction:1458822235740573797>',
  'Warlock-Demonology': '<:wl_demonology:1458822261762166895>',
  'Warlock-Destruction': '<:wl_destruction:1458822292334444850>',

  // Warrior
  'Warrior-Arms': '<:warrior_arms:1458822331957772462>',
  'Warrior-Fury': '<:warrior_fury:1458822360781029438>',
  'Warrior-Protection': '<:warrior_protection:1458822389583446230>',
};

export function getClassList(): string[] {
  return Object.values(WOW_CLASSES);
}

export function getSpecsForClass(className: string): string[] {
  return WOW_SPECS[className] || [];
}

/**
 * Determines the raid role (Tank, Healer, Melee, Ranged) based on a World of Warcraft class and specialization combination.
 *
 * This function maps class/spec combinations to their appropriate raid roles for composition calculations,
 * attendance tracking, and raid planning. It returns null for invalid inputs or unknown combinations.
 *
 * Parameters:
 *   - className: string | null - The WoW class name (e.g., "Druid", "Warrior"). Null or empty returns null.
 *   - specName: string | null - The specialization name (e.g., "Restoration", "Fury"). Null or empty returns null.
 *
 * Returns:
 *   WoWRole | null - The raid role for the class/spec combination ("Tank", "Healer", "Melee", "Ranged"), or null if invalid input or combination not found.
 *
 * Example:
 *   const role = getSpecRole("Druid", "Restoration"); // returns "Healer"
 *   const invalid = getSpecRole(null, "Fury"); // returns null
 */
export function getSpecRole(className: string | null, specName: string | null): WoWRole | null {
  if (!className || !specName) return null;
  const key = `${className}-${specName}`;
  return SPEC_ROLES[key] || null;
}

/**
 * Returns the Discord emoji symbol for a given World of Warcraft class and specialization combination.
 *
 * This function provides visual representations for player specs using custom Discord emojis.
 * It returns an empty string for invalid inputs or unknown combinations.
 *
 * Parameters:
 *   - className: string | null - The WoW class name (e.g., "Druid", "Warrior"). Null or empty returns empty string.
 *   - specName: string | null - The specialization name (e.g., "Restoration", "Fury"). Null or empty returns empty string.
 *
 * Returns:
 *   string - The Discord emoji string for the class/spec combination, or empty string if not found or invalid input.
 *
 * Example:
 *   const symbol = getSpecSymbol("Druid", "Restoration"); // returns '<:druid_restoration:1458821367339290645>'
 *   const invalid = getSpecSymbol(null, "Fury"); // returns ''
 */
export function getSpecSymbol(className: string | null, specName: string | null): string {
  if (!className || !specName) return '';
  const key = `${className}-${specName}`;
  return SPEC_SYMBOLS[key] || '';
}

export interface RoleComposition {
  tanks: number;
  healers: number;
  melee: number;
  ranged: number;
  noClass: number;
}
