import { Client, Events, Entitlement } from 'discord.js';
import { PremiumTier } from '@prisma/client';
import { syncEntitlement, skuToTier } from '../services/entitlementService';

async function handleEntitlement(entitlement: Entitlement, tier: PremiumTier): Promise<void> {
  const guildId = entitlement.guildId;
  if (!guildId) return; // Only handle guild subscriptions

  await syncEntitlement({
    guildId,
    tier,
    expiresAt: entitlement.endsAt ?? undefined,
    entitlementId: entitlement.id,
    source: 'discord',
  });
}

export function registerEntitlementHandlers(client: Client): void {
  client.on(Events.EntitlementCreate, async (entitlement) => {
    try {
      const tier = skuToTier(entitlement.skuId);
      if (!tier) {
        console.warn(`⚠️ Unknown SKU ID: ${entitlement.skuId}`);
        return;
      }
      await handleEntitlement(entitlement, tier);
    } catch (error) {
      console.error('Error handling EntitlementCreate:', error);
    }
  });

  client.on(Events.EntitlementUpdate, async (_oldEntitlement, newEntitlement) => {
    try {
      if (!newEntitlement) return;
      const tier = skuToTier(newEntitlement.skuId);
      if (!tier) return;
      await handleEntitlement(newEntitlement, tier);
    } catch (error) {
      console.error('Error handling EntitlementUpdate:', error);
    }
  });

  client.on(Events.EntitlementDelete, async (entitlement) => {
    try {
      const guildId = entitlement.guildId;
      if (!guildId) return;

      await syncEntitlement({
        guildId,
        tier: 'FREE',
        source: 'discord',
      });
    } catch (error) {
      console.error('Error handling EntitlementDelete:', error);
    }
  });

  console.log('💎 Entitlement handlers registered');
}
