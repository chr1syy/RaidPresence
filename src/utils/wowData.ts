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

export const WOW_SPECS: Record<string, string[]> = {
  [WOW_CLASSES.DEATH_KNIGHT]: ['Blood', 'Frost', 'Unholy'],
  [WOW_CLASSES.DEMON_HUNTER]: ['Havoc', 'Vengeance'],
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
  DPS: '⚔️',
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

// Spec icons/symbols (using Unicode and emojis)
export const SPEC_SYMBOLS: Record<string, string> = {
  // Death Knight
  'Death Knight-Blood': '🩸',
  'Death Knight-Frost': '❄️',
  'Death Knight-Unholy': '☠️',

  // Demon Hunter
  'Demon Hunter-Havoc': '😈',
  'Demon Hunter-Vengeance': '🛡️',

  // Druid
  'Druid-Balance': '🌙',
  'Druid-Feral': '🐱',
  'Druid-Guardian': '🐻',
  'Druid-Restoration': '🌿',

  // Evoker
  'Evoker-Devastation': '🔥',
  'Evoker-Preservation': '💚',
  'Evoker-Augmentation': '✨',

  // Hunter
  'Hunter-Beast Mastery': '🦁',
  'Hunter-Marksmanship': '🎯',
  'Hunter-Survival': '🪓',

  // Mage
  'Mage-Arcane': '🔮',
  'Mage-Fire': '🔥',
  'Mage-Frost': '❄️',

  // Monk
  'Monk-Brewmaster': '🍺',
  'Monk-Mistweaver': '🍃',
  'Monk-Windwalker': '👊',

  // Paladin
  'Paladin-Holy': '✨',
  'Paladin-Protection': '🛡️',
  'Paladin-Retribution': '⚔️',

  // Priest
  'Priest-Discipline': '⚖️',
  'Priest-Holy': '✨',
  'Priest-Shadow': '🌑',

  // Rogue
  'Rogue-Assassination': '🗡️',
  'Rogue-Outlaw': '🏴‍☠️',
  'Rogue-Subtlety': '🌫️',

  // Shaman
  'Shaman-Elemental': '⚡',
  'Shaman-Enhancement': '🔨',
  'Shaman-Restoration': '🌊',

  // Warlock
  'Warlock-Affliction': '☠️',
  'Warlock-Demonology': '👹',
  'Warlock-Destruction': '🔥',

  // Warrior
  'Warrior-Arms': '⚔️',
  'Warrior-Fury': '⚡',
  'Warrior-Protection': '🛡️',
};

export function getClassList(): string[] {
  return Object.values(WOW_CLASSES);
}

export function getSpecsForClass(className: string): string[] {
  return WOW_SPECS[className] || [];
}

export function getSpecRole(className: string | null, specName: string | null): WoWRole | null {
  if (!className || !specName) return null;
  const key = `${className}-${specName}`;
  return SPEC_ROLES[key] || null;
}

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
