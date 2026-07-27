jest.mock('../database/client');

import { buildWelcomeEmbed } from '../utils/welcomeEmbed';
import { t } from '../utils/localization';

function trialField(embed: ReturnType<typeof buildWelcomeEmbed>) {
  return embed.toJSON().fields?.find((f) => f.name.includes('Premium Trial'));
}

describe('buildWelcomeEmbed()', () => {
  it('omits the trial callout when no trial was granted', () => {
    const embed = buildWelcomeEmbed({
      detectedTimezone: 1,
      timezoneOffset: 1,
      trialGranted: false,
      language: 'en',
    });
    expect(trialField(embed)).toBeUndefined();
  });

  it('localizes the trial callout to the guild locale (not hardcoded English)', () => {
    const en = buildWelcomeEmbed({
      detectedTimezone: 1,
      timezoneOffset: 1,
      trialGranted: true,
      language: 'en',
    });
    const de = buildWelcomeEmbed({
      detectedTimezone: 1,
      timezoneOffset: 1,
      trialGranted: true,
      language: 'de',
    });

    const enValue = trialField(en)?.value;
    const deValue = trialField(de)?.value;

    // German locale must render the German trial copy, English the English copy.
    expect(deValue).toContain(t('de', 'premiumTrialGranted', { tier: t('de', 'premiumTierPremium') }));
    expect(enValue).toContain(t('en', 'premiumTrialGranted', { tier: t('en', 'premiumTierPremium') }));

    // Guard against a regression back to the hardcoded 'en' string.
    expect(deValue).not.toBe(enValue);
    expect(deValue).toContain('Testphase');
  });

  it('adds the localized multi-team hint to the trial callout', () => {
    for (const language of ['en', 'de']) {
      const embed = buildWelcomeEmbed({
        detectedTimezone: 1,
        timezoneOffset: 1,
        trialGranted: true,
        language,
      });
      expect(trialField(embed)?.value).toContain(t(language, 'premiumTrialTeamsHint'));
    }
  });

  it('highlights multi-team support in the useful commands field', () => {
    const embed = buildWelcomeEmbed({
      detectedTimezone: 1,
      timezoneOffset: 1,
      trialGranted: false,
      language: 'en',
    });
    const commands = embed.toJSON().fields?.find((f) => f.name.includes('Useful Commands'));
    expect(commands?.value).toContain('/team list');
  });
});
