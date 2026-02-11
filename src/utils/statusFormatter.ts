import { EmbedBuilder } from 'discord.js';
import { getTranslations } from './localization';
import { getSpecRole } from './wowData';

/**
 * Minimal raid data needed for status dashboard display.
 */
export interface StatusRaid {
  id: string;
  description: string | null;
  raidDate: Date;
  status: string;
  attendance: Array<{
    status: string;
    wowClass: string | null;
    wowSpec: string | null;
  }>;
}

/**
 * Roster status indicator thresholds.
 * >=80% attending = FULL, >=50% = GOOD, >=25% = LOW, <25% = CRITICAL
 */
export type RosterStatus = 'full' | 'good' | 'low' | 'critical';

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

/**
 * Determine roster status based on attendance percentage.
 */
export function getRosterStatus(attendingCount: number, totalCount: number): RosterStatus {
  if (totalCount === 0) return 'critical';
  const rate = (attendingCount / totalCount) * 100;
  if (rate >= 80) return 'full';
  if (rate >= 50) return 'good';
  if (rate >= 25) return 'low';
  return 'critical';
}

/**
 * Format the status dashboard embed showing up to 7 upcoming raids.
 *
 * @param raids - Array of upcoming raids (should be pre-sorted by date, max 7)
 * @param language - 'en' | 'de'
 * @returns EmbedBuilder ready to send
 */
export function formatStatusEmbed(raids: StatusRaid[], language: string): EmbedBuilder {
  const trans = getTranslations(language);

  if (raids.length === 0) {
    return new EmbedBuilder()
      .setTitle(trans.statusTitle)
      .setColor(0x808080)
      .setDescription(trans.statusNoUpcomingRaids)
      .setTimestamp();
  }

  // Determine overall color based on worst-case roster status
  let worstStatus: RosterStatus = 'full';

  const fieldLines: string[] = [];

  for (let i = 0; i < raids.length && i < 7; i++) {
    const raid = raids[i];
    const emoji = NUMBER_EMOJIS[i];

    const total = raid.attendance.length;
    const attending = raid.attendance.filter(a => a.status === 'attending' || a.status === 'late').length;
    const attendingRate = total > 0 ? Math.round((attending / total) * 100) : 0;

    // Role composition
    let tanks = 0;
    let healers = 0;
    let dps = 0;
    for (const a of raid.attendance) {
      if (a.status !== 'attending' && a.status !== 'late') continue;
      const role = getSpecRole(a.wowClass, a.wowSpec);
      if (role === 'Tank') tanks++;
      else if (role === 'Healer') healers++;
      else dps++; // Melee + Ranged + noClass all count as DPS slot
    }

    const rosterStatus = getRosterStatus(attending, total);
    if (rosterStatus === 'critical') worstStatus = 'critical';
    else if (rosterStatus === 'low' && worstStatus !== 'critical') worstStatus = 'low';
    else if (rosterStatus === 'good' && worstStatus !== 'low' && worstStatus !== 'critical') worstStatus = 'good';

    const statusIndicator = rosterStatus === 'full'
      ? `✅ ${trans.statusFull}`
      : rosterStatus === 'good'
        ? `🟢 ${trans.statusGood}`
        : rosterStatus === 'low'
          ? `⚠️ ${trans.statusLow}`
          : `🔴 ${trans.statusCritical}`;

    const timestamp = Math.floor(raid.raidDate.getTime() / 1000);
    const title = raid.description || trans.raidEvent;

    fieldLines.push(
      `${emoji} **${title}**\n` +
      `<t:${timestamp}:F> (<t:${timestamp}:R>)\n` +
      `${trans.statusRoster}: ${attending}/${total} (${attendingRate}%) — ${statusIndicator}\n` +
      `🛡️ ${tanks} | 💚 ${healers} | ⚔️ ${dps}`
    );
  }

  const embedColor = worstStatus === 'full'
    ? 0x00ae86  // green
    : worstStatus === 'good'
      ? 0xffd700  // yellow
      : worstStatus === 'low'
        ? 0xffa500  // orange
        : 0xff4500; // red

  const embed = new EmbedBuilder()
    .setTitle(trans.statusTitle)
    .setColor(embedColor)
    .setDescription(fieldLines.join('\n\n'))
    .setTimestamp();

  return embed;
}
