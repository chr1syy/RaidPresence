jest.mock('../database/client');

import {
  buildWelcomeEmbed,
  buildWelcomeButtons,
  buildWelcomeMessage,
} from '../utils/welcomeEmbed';
import { t } from '../utils/localization';
import { TRIAL_DAYS } from '../services/entitlementService';

const GUILD_ID = '123456789012345678';

function trialField(embed: ReturnType<typeof buildWelcomeEmbed>) {
  return embed.toJSON().fields?.find((f) => f.name.includes('Premium'));
}

describe('buildWelcomeEmbed()', () => {
  // Issue #39: the old embed was 5 fields and ~1500 characters of numbered setup
  // steps shown before the user had done anything. It is a greeting, not a manual.
  describe('brevity', () => {
    it('has at most two fields', () => {
      for (const trialGranted of [true, false]) {
        const fields = buildWelcomeEmbed({ trialGranted, language: 'en' }).toJSON().fields ?? [];
        expect(fields.length).toBeLessThanOrEqual(2);
      }
    });

    it('has no fields at all when there is no trial to announce', () => {
      const fields = buildWelcomeEmbed({ trialGranted: false, language: 'en' }).toJSON().fields ?? [];
      expect(fields).toHaveLength(0);
    });

    it('fits on screen without scrolling', () => {
      const embed = buildWelcomeEmbed({ trialGranted: true, language: 'en' }).toJSON();
      const total =
        (embed.title?.length ?? 0) +
        (embed.description?.length ?? 0) +
        (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);

      // The old embed was ~1400-1600 characters. Half of that is still generous.
      expect(total).toBeLessThan(700);
    });

    it('drops the four numbered setup steps and the command reference', () => {
      const json = buildWelcomeEmbed({ trialGranted: true, language: 'en' }).toJSON();
      const text = JSON.stringify(json);

      for (const marker of ['1️⃣', '2️⃣', '3️⃣', '4️⃣', 'Useful Commands', 'Quick Setup']) {
        expect(text).not.toContain(marker);
      }
    });
  });

  describe('the message itself', () => {
    // The inversion is the product's whole pitch and used to be buried mid-paragraph.
    it('states the core benefit — absence tracking, not sign-ups — in one sentence', () => {
      const description = buildWelcomeEmbed({ trialGranted: false, language: 'en' }).toJSON()
        .description!;

      const benefitLine = description.split('\n')[0];
      expect(benefitLine).toContain('absences');
      expect(benefitLine.length).toBeLessThan(220);
    });

    it('makes no claim about the timezone', () => {
      const text = JSON.stringify(buildWelcomeEmbed({ trialGranted: true, language: 'en' }).toJSON());

      // The old embed asserted "Timezone auto-detected as GMT-5" — in Germany.
      expect(text).not.toContain('auto-detected');
      expect(text).not.toMatch(/GMT[+-]/);
      expect(text).not.toContain('timezone offset');
    });
  });

  describe('localization', () => {
    // Previously only the trial line was localized; the rest was hardcoded English.
    it('renders the whole embed in the guild language, not just the trial line', () => {
      const en = buildWelcomeEmbed({ trialGranted: false, language: 'en' }).toJSON();
      const de = buildWelcomeEmbed({ trialGranted: false, language: 'de' }).toJSON();

      expect(de.description).not.toBe(en.description);
      expect(de.description).toContain('Abwesenheiten');
      expect(en.description).toContain('absences');
      expect(de.title).toBe(t('de', 'welcomeTitle'));
    });

    it('localizes the trial callout', () => {
      const de = buildWelcomeEmbed({ trialGranted: true, language: 'de' });
      const en = buildWelcomeEmbed({ trialGranted: true, language: 'en' });

      expect(trialField(de)?.value).toContain(
        t('de', 'premiumTrialGranted', { days: TRIAL_DAYS, tier: t('de', 'premiumTierPremium') })
      );
      expect(trialField(de)?.value).not.toBe(trialField(en)?.value);
      expect(trialField(de)?.value).toContain('Testphase');
    });

    it('omits the trial callout when no trial was granted', () => {
      expect(trialField(buildWelcomeEmbed({ trialGranted: false, language: 'en' }))).toBeUndefined();
    });
  });
});

describe('buildWelcomeButtons()', () => {
  it('renders exactly the two buttons from the issue', () => {
    const row = buildWelcomeButtons(GUILD_ID, 'en').toJSON();

    expect(row.components).toHaveLength(2);
    expect((row.components as any[]).map((c) => c.label)).toEqual([
      t('en', 'welcomeButtonSetup'),
      t('en', 'welcomeButtonFirstRaid'),
    ]);
  });

  it('localizes the button labels', () => {
    const de = buildWelcomeButtons(GUILD_ID, 'de').toJSON();
    expect((de.components as any[]).map((c) => c.label)).toEqual([
      'Setup starten',
      'Ersten Raid anlegen',
    ]);
  });

  // The welcome message is delivered by DM first, where the interaction carries no
  // guild of its own — the id has to travel in the custom ID or "back to the
  // server" is unanswerable.
  it('embeds the guild id in both custom IDs', () => {
    const row = buildWelcomeButtons(GUILD_ID, 'en').toJSON();

    for (const component of row.components as any[]) {
      expect(component.custom_id).toContain(GUILD_ID);
    }
  });
});

describe('buildWelcomeMessage()', () => {
  it('bundles the embed and the buttons for every delivery path', () => {
    const message = buildWelcomeMessage({ trialGranted: false, language: 'en', guildId: GUILD_ID });

    expect(message.embeds).toHaveLength(1);
    expect(message.components).toHaveLength(1);
    expect(message.components[0].toJSON().components).toHaveLength(2);
  });
});
