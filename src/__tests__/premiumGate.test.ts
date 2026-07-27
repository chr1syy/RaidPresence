jest.mock('../database/client');
jest.mock('../services/entitlementService');

import { gateFeature, premiumUpsellEmbed, premiumFooterHint, freeTierHint } from '../middleware/premiumGate';
import { getTier, hasFeature, FEATURE_TIERS } from '../services/entitlementService';

const mockGetTier = getTier as jest.MockedFunction<typeof getTier>;
const mockHasFeature = hasFeature as jest.MockedFunction<typeof hasFeature>;

function createMockInteraction(guildId: string = 'guild1') {
  return {
    guildId,
    replied: false,
    deferred: false,
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  } as any;
}

/** Extracts the first embed's serialized JSON from a reply/followUp mock call. */
function embedFrom(fn: jest.Mock) {
  const arg = fn.mock.calls[0][0];
  return arg.embeds[0].toJSON();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('gateFeature()', () => {
  it('returns true when tier has access', async () => {
    mockGetTier.mockResolvedValue('PREMIUM');
    mockHasFeature.mockReturnValue(true);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.archive', 'en');

    expect(result).toBe(true);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('returns false and sends an upsell embed when tier lacks access', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.archive', 'en');

    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        embeds: expect.any(Array),
      }),
    );
    const embed = embedFrom(interaction.reply);
    expect(embed.title).toContain('Premium');
    expect(embed.title).toContain('Raid Archive');
  });

  it('shows the current tier on the upsell embed', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    await gateFeature(interaction, 'raid.template', 'en');

    const embed = embedFrom(interaction.reply);
    const currentPlanField = embed.fields?.find((f: any) => f.name === 'Your Plan');
    const requiredPlanField = embed.fields?.find((f: any) => f.name === 'Required Plan');
    expect(currentPlanField?.value).toBe('Free');
    expect(requiredPlanField?.value).toBe('Premium');
  });

  it('uses followUp when interaction already replied', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    interaction.replied = true;
    const result = await gateFeature(interaction, 'raid.archive', 'en');

    expect(result).toBe(false);
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true, embeds: expect.any(Array) }),
    );
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('returns false when guildId is null', async () => {
    const interaction = createMockInteraction();
    interaction.guildId = null;

    const result = await gateFeature(interaction, 'raid.archive', 'en');
    expect(result).toBe(false);
  });

  it('gates the premium-only template feature correctly', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.template', 'en');

    expect(result).toBe(false);
    const title = embedFrom(interaction.reply).title;
    expect(title).toContain('Raid Templates');
    expect(title).toContain('Premium');
  });

  it('sends German upsell when language is de', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.optout_reason', 'de');

    expect(result).toBe(false);
    const embed = embedFrom(interaction.reply);
    expect(embed.title).toContain('Funktion');
    expect(embed.description).toContain('Abonnements');
  });
});

describe('premiumUpsellEmbed()', () => {
  it('renders feature name, required tier, and both plan fields', () => {
    const embed = premiumUpsellEmbed('stats.analytics', 'FREE', 'PREMIUM', 'en').toJSON();
    expect(embed.title).toBe('💎 Attendance Analytics is a Premium feature');
    expect(embed.color).toBe(0xf1c40f);
    expect(embed.fields).toEqual([
      { name: 'Your Plan', value: 'Free', inline: true },
      { name: 'Required Plan', value: 'Premium', inline: true },
      { name: '💎 Premium', value: expect.stringContaining('Multiple teams'), inline: false },
    ]);
    expect(embed.footer?.text).toContain('RaidPresence');
  });

  it('lists the premium perks with multi-team first', () => {
    const embed = premiumUpsellEmbed('raid.archive', 'FREE', 'PREMIUM', 'en').toJSON();
    const perks = embed.fields?.find((f: any) => !f.inline)?.value ?? '';
    const lines = perks.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Multiple teams');
    expect(perks).toContain('Unlimited raids');
    expect(perks).toContain('archives');
    expect(perks).toContain('analytics');
  });

  it('localizes the perks field to German', () => {
    const embed = premiumUpsellEmbed('raid.archive', 'FREE', 'PREMIUM', 'de').toJSON();
    const perksField = embed.fields?.find((f: any) => !f.inline);
    expect(perksField?.name).toBe('💎 Premium');
    expect(perksField?.value).toContain('Mehrere Teams');
  });

  it('localizes to German', () => {
    const embed = premiumUpsellEmbed('raid.template', 'FREE', 'PREMIUM', 'de').toJSON();
    expect(embed.title).toContain('Premium-Funktion');
    expect(embed.fields?.[0]).toEqual({ name: 'Dein Plan', value: 'Free', inline: true });
  });
});

describe('premiumFooterHint()', () => {
  it('returns a Discord subtext line', () => {
    expect(premiumFooterHint('en')).toMatch(/^-# /);
    expect(premiumFooterHint('en')).toContain('Premium');
  });

  it('localizes to German', () => {
    expect(premiumFooterHint('de')).toMatch(/^-# /);
    expect(premiumFooterHint('de')).toContain('Upgrade auf Premium');
  });
});

describe('freeTierHint()', () => {
  it('returns the hint prefixed with a newline for free guilds', async () => {
    mockGetTier.mockResolvedValue('FREE');

    expect(await freeTierHint('guild1', 'en')).toBe(`\n${premiumFooterHint('en')}`);
    expect(mockGetTier).toHaveBeenCalledWith('guild1');
  });

  it('localizes the hint', async () => {
    mockGetTier.mockResolvedValue('FREE');

    expect(await freeTierHint('guild1', 'de')).toContain('Upgrade auf Premium');
  });

  it('returns an empty string for premium guilds', async () => {
    mockGetTier.mockResolvedValue('PREMIUM');

    expect(await freeTierHint('guild1', 'en')).toBe('');
  });

  it('returns an empty string outside of a guild without hitting the tier lookup', async () => {
    expect(await freeTierHint(null, 'en')).toBe('');
    expect(mockGetTier).not.toHaveBeenCalled();
  });
});
