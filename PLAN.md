# Premium Infrastructure Implementation Plan

**Phases:** 1.2 (Schema), 1.3 (Entitlement Service), 1.4 (Gate Middleware)
**Branch:** `feature/premium-infrastructure`

---

## Phase 1.2 — Prisma Schema

**File:** `prisma/schema.prisma`

### Changes

1. Add `PremiumTier` enum:
   ```prisma
   enum PremiumTier {
     FREE
     PREMIUM
     PRO
   }
   ```

2. Add fields to `Guild` model (after `autoArchive`):
   ```prisma
   // Premium system (Phase 1.2)
   premiumTier          PremiumTier @default(FREE)
   premiumExpiresAt     DateTime?
   entitlementId        String?
   weeklyRaidCount      Int         @default(0)
   weeklyRaidCountResetAt DateTime?
   trialStartedAt       DateTime?
   ```

3. Run migration: `npx prisma migrate dev --name add-premium-tier`
4. Run `npx prisma generate`

### Notes
- No index on `premiumTier` needed — lookups are always by guild ID (primary key).
- `entitlementId` is nullable because guilds start on FREE without a Discord/Stripe entitlement.
- `weeklyRaidCountResetAt` tracks the start of the current counting window.

---

## Phase 1.3 — Entitlement Service

**New file:** `src/services/entitlementService.ts`

> This is a new `services/` directory. The existing pattern uses `utils/` for stateless helpers. Services that encapsulate DB writes and business logic belong in a separate directory to keep the distinction clean.

### Exports

```typescript
// Types
export type PremiumFeature =
  | 'raid.notes' | 'raid.archive' | 'raid.recurring'
  | 'raid.template' | 'raid.integrations'
  | 'stats.full_history' | 'stats.export';

// Core functions
export async function getTier(guildId: string): Promise<PremiumTier>
export async function syncEntitlement(params: {
  guildId: string;
  tier: PremiumTier;
  expiresAt?: Date;
  entitlementId?: string;
  source: 'discord' | 'stripe';
}): Promise<void>
export function hasFeature(tier: PremiumTier, feature: PremiumFeature): boolean
export async function checkWeeklyLimit(guildId: string): Promise<{ allowed: boolean; remaining: number }>
export async function incrementWeeklyRaidCount(guildId: string): Promise<void>
```

### Implementation Details

**`getTier(guildId)`**
- Query `prisma.guild.findUnique({ where: { id: guildId }, select: { premiumTier, premiumExpiresAt } })`
- If `premiumExpiresAt` is set and past → return `FREE` (expired)
- Otherwise return stored tier, default `FREE` if guild not found

**`syncEntitlement(params)`**
- `prisma.guild.update()` with tier, expiresAt, entitlementId
- Provider-agnostic: `source` field is logged but not stored (entitlementId differentiates)
- On downgrade to FREE: clear `entitlementId`, `premiumExpiresAt`

**`hasFeature(tier, feature)`**
- Pure function, no DB call
- Checks against `FEATURE_TIERS` map (defined in premiumGate.ts, imported here — or co-located)
- `FREE` tier → always `false` for gated features
- Tier hierarchy: `PRO > PREMIUM > FREE` (PRO includes all PREMIUM features)

**`checkWeeklyLimit(guildId)`**
- Read guild's `weeklyRaidCount` and `weeklyRaidCountResetAt`
- If `weeklyRaidCountResetAt` is null or > 7 days ago → reset count to 0, update `weeklyRaidCountResetAt` to now
- FREE limit: 5 raids/week
- PREMIUM/PRO: unlimited (return `{ allowed: true, remaining: Infinity }`)
- Return `{ allowed: count < 5, remaining: Math.max(0, 5 - count) }`

**`incrementWeeklyRaidCount(guildId)`**
- `prisma.guild.update({ where: { id: guildId }, data: { weeklyRaidCount: { increment: 1 } } })`

### Gateway Listeners

**File:** `src/events/entitlementHandler.ts`

Register in `src/index.ts` alongside existing event handlers:

```typescript
// Entitlement events (Premium system)
client.on(Events.EntitlementCreate, async (entitlement) => { ... });
client.on(Events.EntitlementUpdate, async (entitlement) => { ... });
client.on(Events.EntitlementDelete, async (entitlement) => { ... });
```

- Map Discord SKU IDs → tiers via env vars: `DISCORD_SKU_PREMIUM`, `DISCORD_SKU_PRO`
- Call `syncEntitlement()` with the appropriate tier
- On delete → sync to FREE
- Filter: only process entitlements where `entitlement.guildId` is set (guild subscriptions)

**Intent:** No additional intent needed — `GatewayIntentBits.Guilds` already covers entitlement events.

---

## Phase 1.4 — Gate Middleware

**New file:** `src/middleware/premiumGate.ts`

### Feature → Tier Map (single source of truth)

```typescript
export const FEATURE_TIERS: Record<PremiumFeature, PremiumTier> = {
  'raid.notes':        'PREMIUM',
  'raid.archive':      'PREMIUM',
  'raid.recurring':    'PREMIUM',
  'stats.full_history':'PREMIUM',
  'raid.template':     'PRO',
  'stats.export':      'PRO',
  'raid.integrations': 'PRO',
};
```

### Gate Function

```typescript
export async function gateFeature(
  interaction: ChatInputCommandInteraction,
  feature: PremiumFeature,
  language: string,
): Promise<boolean>
```

- Calls `getTier(interaction.guildId)`
- Calls `hasFeature(tier, feature)`
- If allowed → return `true`
- If blocked → send ephemeral upsell reply using i18n keys, return `false`

### Free Tier Limits

| Limit | Free | Premium | Pro |
|-------|------|---------|-----|
| Raids/week | 5 | unlimited | unlimited |
| Raid history (attendance) | 10 raids | unlimited | unlimited |

### Where to Apply Gates

| Command | Subcommand | Gate | How |
|---------|------------|------|-----|
| `/raid` | `create` | Weekly limit | Call `checkWeeklyLimit()` before creation, `incrementWeeklyRaidCount()` after |
| `/raid` | `notes`* | `raid.notes` | `gateFeature()` at handler entry |
| `/raid` | `archive` | `raid.archive` | `gateFeature()` at handler entry |
| `/raid` | `unarchive` | `raid.archive` | `gateFeature()` at handler entry |
| `/raid` | `search` | `raid.archive` | `gateFeature()` at handler entry |
| `/raid` | `clone` | `raid.template` | `gateFeature()` at handler entry |
| `/stats` | `attendance` | Cap at 10 raids for FREE | Slice results after query |
| `/stats` | `guild` | `stats.full_history` for period=all | `gateFeature()` for non-week/month periods |

> *Note: `/raid notes` is referenced in the spec as a subcommand. Currently raid notes are handled via button modals in `buttonHandler.ts` (optout reason modal). The gate should be applied at the modal submission handler for opt-out reasons and player notes.

### Spec Clarifications

The original spec mentions `/stats archive|unarchive|search` — in the actual codebase, `archive`, `unarchive`, and `search` are subcommands of `/raid`, not `/stats`. Similarly, "attendance" is `/stats attendance`, not `/raid attendance`. This plan uses the **actual command locations**.

---

## i18n Keys to Add

**File:** `src/utils/localization.ts`

Add to `Translations` interface and both language objects:

```typescript
// Premium system (Phase 1.4)
premiumRequired: string;         // "This feature requires {tier}."
premiumUpsell: string;           // "Upgrade to {tier} to unlock {feature}. ..."
premiumWeeklyLimitReached: string; // "Weekly raid limit reached ({count}/{max}). Resets {resetDate}."
premiumWeeklyLimitInfo: string;  // "You have {remaining} raids left this week."
premiumTierFree: string;         // "Free"
premiumTierPremium: string;      // "Premium"
premiumTierPro: string;          // "Pro"
premiumExpired: string;          // "Your {tier} subscription has expired."
premiumAttendanceCapped: string; // "Showing last {count} raids. Upgrade to Premium for full history."
```

---

## File Changes Summary

| Action | Path | Description |
|--------|------|-------------|
| Edit | `prisma/schema.prisma` | Add `PremiumTier` enum + Guild fields |
| Create | `src/services/entitlementService.ts` | Core premium business logic |
| Create | `src/events/entitlementHandler.ts` | Discord entitlement gateway listeners |
| Create | `src/middleware/premiumGate.ts` | Feature gating + FEATURE_TIERS map |
| Edit | `src/index.ts` | Register entitlement event listeners |
| Edit | `src/utils/localization.ts` | Add premium i18n keys (en + de) |
| Edit | `src/commands/raid.ts` | Add gate checks to create/archive/unarchive/search/clone |
| Edit | `src/commands/stats.ts` | Add attendance cap + full_history gate |
| Edit | `src/events/buttonHandler.ts` | Gate raid notes (optout reason modal) |
| Create | `src/__tests__/entitlementService.test.ts` | Unit tests for entitlement logic |
| Create | `src/__tests__/premiumGate.test.ts` | Unit tests for gate middleware |

---

## Execution Order

1. **Schema** — Prisma migration (no code deps)
2. **i18n** — Add translation keys (no code deps)
3. **Entitlement Service** — Core logic (depends on schema)
4. **Entitlement Handler** — Gateway events (depends on service)
5. **Gate Middleware** — Feature gating (depends on service + i18n)
6. **Wire Gates** — Edit raid.ts, stats.ts, buttonHandler.ts (depends on middleware)
7. **Register Events** — Edit index.ts (depends on handler)
8. **Tests** — After all code is in place

---

## Resolved Decisions

1. **Upsell format**: Text-only ephemeral reply with hint to `/premium` command (no buttons/URLs yet — avoids dead links before web billing exists)
2. **Trial flow**: `trialStartedAt` is schema-only — no code reads/writes it in phases 1.2–1.4. Placeholder for future trial implementation, zero migration cost later.
3. **Raid teams**: Dropped from scope. No "raid team" concept exists — raids are ad-hoc with role-based member scanning. Weekly raid count limit (5/week) is the meaningful free-tier gate on `/raid create`.

---

## Detailed Implementation Walk-through

### Phase 1.2 — Schema (what changes in the DB)

The migration adds 6 columns to the `Guild` table. All have defaults or are nullable, so **zero impact on existing rows** — every guild starts as `FREE` with null optional fields. No data backfill needed.

```sql
-- What the migration produces (conceptual):
ALTER TABLE "Guild" ADD COLUMN "premiumTier" "PremiumTier" NOT NULL DEFAULT 'FREE';
ALTER TABLE "Guild" ADD COLUMN "premiumExpiresAt" TIMESTAMP;
ALTER TABLE "Guild" ADD COLUMN "entitlementId" TEXT;
ALTER TABLE "Guild" ADD COLUMN "weeklyRaidCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Guild" ADD COLUMN "weeklyRaidCountResetAt" TIMESTAMP;
ALTER TABLE "Guild" ADD COLUMN "trialStartedAt" TIMESTAMP;
```

### Phase 1.3 — Entitlement Service (the business logic)

**`src/services/entitlementService.ts`** — ~120 lines, 5 exported functions.

```
┌─────────────────────────────────────────────────┐
│ entitlementService.ts                           │
│                                                 │
│  getTier(guildId)                               │
│    └─ reads Guild.premiumTier + expiresAt       │
│    └─ returns effective tier (FREE if expired)   │
│                                                 │
│  syncEntitlement({ guildId, tier, ... })         │
│    └─ writes Guild premium fields               │
│    └─ called by entitlementHandler (Discord)    │
│    └─ called by future Stripe webhook           │
│                                                 │
│  hasFeature(tier, feature)                       │
│    └─ pure function: FEATURE_TIERS[feature]     │
│    └─ PRO ⊃ PREMIUM ⊃ FREE                     │
│                                                 │
│  checkWeeklyLimit(guildId)                       │
│    └─ reads weeklyRaidCount + resetAt           │
│    └─ auto-resets if window expired (>7 days)   │
│    └─ returns { allowed, remaining }            │
│                                                 │
│  incrementWeeklyRaidCount(guildId)               │
│    └─ atomic increment after successful create  │
└─────────────────────────────────────────────────┘
```

**Weekly limit flow in `checkWeeklyLimit`:**
```
Guild.weeklyRaidCountResetAt = 2026-03-18  (Monday)
Guild.weeklyRaidCount = 3
Today = 2026-03-22 (Saturday, 4 days later)

→ 4 < 7 days, window still active
→ { allowed: true, remaining: 2 }

If today were 2026-03-26 (>7 days):
→ Reset: weeklyRaidCount = 0, resetAt = now()
→ { allowed: true, remaining: 5 }
```

**`src/events/entitlementHandler.ts`** — ~60 lines, 3 event handlers.

```
Discord fires EntitlementCreate
  → entitlement.skuId === process.env.DISCORD_SKU_PREMIUM
  → syncEntitlement({ guildId, tier: 'PREMIUM', expiresAt, source: 'discord' })

Discord fires EntitlementDelete
  → syncEntitlement({ guildId, tier: 'FREE', source: 'discord' })
```

Exported as a single `registerEntitlementHandlers(client)` function called from `index.ts`.

### Phase 1.4 — Gate Middleware (where checks happen)

**`src/middleware/premiumGate.ts`** — ~80 lines.

**`gateFeature()` flow:**
```
/raid archive <raid_id>
  │
  ├─ gateFeature(interaction, 'raid.archive', lang)
  │    ├─ getTier(guildId)        → 'FREE'
  │    ├─ hasFeature('FREE', 'raid.archive')  → false
  │    ├─ interaction.reply({ ephemeral: true,
  │    │     content: "This feature requires Premium. Use /premium to learn more." })
  │    └─ return false
  │
  └─ if (!allowed) return;  // handler exits early
```

**`/raid create` weekly limit flow:**
```
handleCreateRaid(interaction)
  │
  ├─ checkWeeklyLimit(guildId)  → { allowed: false, remaining: 0 }
  │    └─ interaction.reply({ ephemeral: true,
  │         content: "Weekly raid limit reached (5/5). Resets Mon Mar 25." })
  │    └─ return
  │
  ├─ ... normal raid creation ...
  │
  └─ incrementWeeklyRaidCount(guildId)  // only after successful create
```

**`/stats attendance` cap flow:**
```
handleAttendance(interaction)
  │
  ├─ tier = getTier(guildId)
  ├─ query raids normally
  ├─ if tier === 'FREE' && raids.length > 10:
  │    raids = raids.slice(0, 10)
  │    append footer: "Showing last 10 raids. Upgrade to Premium for full history."
  └─ build embed with (possibly capped) raids
```

### Wiring — What changes in existing files

**`src/commands/raid.ts`** — Add 5 gate checks:
```typescript
// In execute(), before each handler:
case 'create':
  // Weekly limit check (not a feature gate — separate logic)
  const limit = await checkWeeklyLimit(guildId);
  if (!limit.allowed) { reply ephemeral; return; }
  await handleCreateRaid(interaction);
  await incrementWeeklyRaidCount(guildId);  // after success
  break;

case 'archive':
case 'unarchive':
case 'search':
  if (!await gateFeature(interaction, 'raid.archive', lang)) return;
  // existing handler
  break;

case 'clone':
  if (!await gateFeature(interaction, 'raid.template', lang)) return;
  // existing handler
  break;
```

**`src/commands/stats.ts`** — 2 changes:
- `attendance` handler: cap results for FREE tier
- `guild` handler with `period=all`: gate behind `stats.full_history`

**`src/events/buttonHandler.ts`** — 1 change:
- Optout reason modal submission: gate behind `raid.notes`

**`src/index.ts`** — 1 addition:
```typescript
import { registerEntitlementHandlers } from './events/entitlementHandler';
// In client.once(Events.ClientReady, ...):
registerEntitlementHandlers(client);
```

### Test Plan

**`src/__tests__/entitlementService.test.ts`:**
- `getTier`: returns FREE for unknown guild, returns stored tier, returns FREE when expired
- `syncEntitlement`: sets tier + expiresAt, clears on downgrade to FREE
- `hasFeature`: tier hierarchy (PRO includes PREMIUM features), FREE gets nothing
- `checkWeeklyLimit`: fresh guild gets 5, counts down correctly, resets after 7 days
- `incrementWeeklyRaidCount`: atomic increment

**`src/__tests__/premiumGate.test.ts`:**
- `gateFeature`: allows when tier sufficient, blocks with ephemeral when insufficient
- Upsell message uses correct i18n key and tier name
- Weekly limit integration with `/raid create` flow
