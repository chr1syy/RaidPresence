jest.mock('../database/client');
jest.mock('../services/entitlementService');

import { gateFeature } from '../middleware/premiumGate';
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

  it('returns false and sends upsell when tier lacks access', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.archive', 'en');

    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeral: true,
        content: expect.stringContaining('Premium'),
      }),
    );
  });

  it('uses followUp when interaction already replied', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    interaction.replied = true;
    const result = await gateFeature(interaction, 'raid.archive', 'en');

    expect(result).toBe(false);
    expect(interaction.followUp).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    );
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('returns false when guildId is null', async () => {
    const interaction = createMockInteraction();
    interaction.guildId = null;

    const result = await gateFeature(interaction, 'raid.archive', 'en');
    expect(result).toBe(false);
  });

  it('gates PRO features correctly', async () => {
    mockGetTier.mockResolvedValue('PREMIUM');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.template', 'en');

    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Pro'),
      }),
    );
  });

  it('sends German upsell when language is de', async () => {
    mockGetTier.mockResolvedValue('FREE');
    mockHasFeature.mockReturnValue(false);

    const interaction = createMockInteraction();
    const result = await gateFeature(interaction, 'raid.optout_reason', 'de');

    expect(result).toBe(false);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Upgrade auf'),
      }),
    );
  });
});
