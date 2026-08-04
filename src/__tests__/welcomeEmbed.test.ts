jest.mock('../database/client');

import { buildWelcomeEmbed } from '../utils/welcomeEmbed';
import { t } from '../utils/localization';

function trialField(embed: ReturnType<typeof buildWelcomeEmbed>) {
  return embed.toJSON().fields?.find((f) => f.name.includes('Premium Trial'));
}

describe('buildWelcomeEmbed()', () => {
  it('omits the trial callout when no trial was granted', () => {
    const embed = buildWelcomeEmbed({
      trialGranted: false,
      language: 'en',
    });
    expect(trialField(embed)).toBeUndefined();
  });

  it('localizes the trial callout to the guild locale (not hardcoded English)', () => {
    const en = buildWelcomeEmbed({
      trialGranted: true,
      language: 'en',
    });
    const de = buildWelcomeEmbed({
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
        trialGranted: true,
        language,
      });
      expect(trialField(embed)?.value).toContain(t(language, 'premiumTrialTeamsHint'));
    }
  });

  it('highlights multi-team support in the useful commands field', () => {
    const embed = buildWelcomeEmbed({
      trialGranted: false,
      language: 'en',
    });
    const commands = embed.toJSON().fields?.find((f) => f.name.includes('Useful Commands'));
    expect(commands?.value).toContain('/team list');
  });

  it('points at the required roles: option of /raid create instead of the deleted /config raid-roles', () => {
    const fields = buildWelcomeEmbed({
      trialGranted: false,
      language: 'en',
    }).toJSON().fields ?? [];

    // `/config raid-roles` was removed - no field may still advertise it.
    for (const field of fields) {
      expect(field.value).not.toContain('/config raid-roles');
    }

    const rolesField = fields.find((f) => f.name.includes('Raid Attendance Roles'));
    expect(rolesField?.value).toContain('/raid create');
    expect(rolesField?.value).toContain('roles:');
  });

  it('uses a future example date in the /raid create sample so it is copy-pasteable', () => {
    const fields = buildWelcomeEmbed({
      trialGranted: false,
      language: 'en',
    }).toJSON().fields ?? [];

    const createField = fields.find((f) => f.name.includes('Create Your First Raid'));
    const date = createField?.value.match(/date:(\d{4}-\d{2}-\d{2})/)?.[1];

    expect(date).toBeDefined();
    // The retired hardcoded sample must not reappear in any field.
    for (const field of fields) {
      expect(field.value).not.toContain('2026-01-15');
    }
    // `/raid create` rejects past dates, so the sample must always be in the future.
    expect(new Date(`${date}T00:00:00Z`).getTime()).toBeGreaterThan(Date.now());
    // All required options must be present, otherwise the sample is not executable.
    expect(createField?.value).toContain('roles:');
  });
});
