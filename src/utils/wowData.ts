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

export type WoWRole = 'Tank' | 'Healer' | 'DPS';

// Map of class + spec to role
const SPEC_ROLES: Record<string, WoWRole> = {
  // Death Knight
  'Death Knight-Blood': 'Tank',
  'Death Knight-Frost': 'DPS',
  'Death Knight-Unholy': 'DPS',

  // Demon Hunter
  'Demon Hunter-Havoc': 'DPS',
  'Demon Hunter-Vengeance': 'Tank',

  // Druid
  'Druid-Balance': 'DPS',
  'Druid-Feral': 'DPS',
  'Druid-Guardian': 'Tank',
  'Druid-Restoration': 'Healer',

  // Evoker
  'Evoker-Devastation': 'DPS',
  'Evoker-Preservation': 'Healer',
  'Evoker-Augmentation': 'DPS',

  // Hunter
  'Hunter-Beast Mastery': 'DPS',
  'Hunter-Marksmanship': 'DPS',
  'Hunter-Survival': 'DPS',

  // Mage
  'Mage-Arcane': 'DPS',
  'Mage-Fire': 'DPS',
  'Mage-Frost': 'DPS',

  // Monk
  'Monk-Brewmaster': 'Tank',
  'Monk-Mistweaver': 'Healer',
  'Monk-Windwalker': 'DPS',

  // Paladin
  'Paladin-Holy': 'Healer',
  'Paladin-Protection': 'Tank',
  'Paladin-Retribution': 'DPS',

  // Priest
  'Priest-Discipline': 'Healer',
  'Priest-Holy': 'Healer',
  'Priest-Shadow': 'DPS',

  // Rogue
  'Rogue-Assassination': 'DPS',
  'Rogue-Outlaw': 'DPS',
  'Rogue-Subtlety': 'DPS',

  // Shaman
  'Shaman-Elemental': 'DPS',
  'Shaman-Enhancement': 'DPS',
  'Shaman-Restoration': 'Healer',

  // Warlock
  'Warlock-Affliction': 'DPS',
  'Warlock-Demonology': 'DPS',
  'Warlock-Destruction': 'DPS',

  // Warrior
  'Warrior-Arms': 'DPS',
  'Warrior-Fury': 'DPS',
  'Warrior-Protection': 'Tank',
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

export interface RoleComposition {
  tanks: number;
  healers: number;
  dps: number;
}
