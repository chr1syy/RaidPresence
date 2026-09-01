# Top.gg Integration

RaidPresence is listed on Top.gg. This guide covers the two integration points, where to
get each credential, and what happens when they are absent.

Both are **optional and independently gated**. A deployment with neither variable set
behaves exactly as it did before the integration existed: one informational log line at
startup, and nothing else.

| Variable | Enables | Status |
|---|---|---|
| `TOPGG_TOKEN` | Posting the server count to the listing | Shipped |
| `TOPGG_WEBHOOK_SECRET` | Receiving vote webhooks | Separate PR |

---

## Server count posting

Without this, the Top.gg listing permanently displays **0 servers**. Top.gg ranks and
filters listings by server count, so a zero costs both placement and click-through.

### Getting `TOPGG_TOKEN`

1. Sign in at <https://top.gg> with the Discord account that owns the bot listing.
2. Go to the bot's page: `https://top.gg/bot/<BOT_ID>`.
3. Open **Edit** → **Webhooks** (the tab is named "Webhooks" but the API token lives there
   too), or go directly to `https://top.gg/bot/<BOT_ID>/webhooks`.
4. Copy the value labelled **Token**. This is the API token.

> **Do not confuse the two credentials.** The **Token** on that page authenticates
> *outgoing* requests from the bot to Top.gg (server count). The **Authorization** field
> further down is a secret *you choose*, used to verify *incoming* vote webhooks. They are
> different values and are not interchangeable.

### Configuration

```bash
TOPGG_TOKEN=your_topgg_api_token_here
```

### Behaviour

- **Set:** the bot posts its server count once at startup, then every 30 minutes.
- **Unset:** the bot logs `ℹ️ Top.gg: TOPGG_TOKEN is not set — server count posting is
  disabled` once at startup. No timer is created and no request is ever made.

The count comes from `client.guilds.cache.size` — the guilds the gateway currently has
the bot in. It is deliberately **not** read from the database: the `Guild` table retains a
row for every guild that ever installed the bot (departures are marked with `leftAt`, not
deleted), so a naive `SELECT count(*)` would report roughly 2.5x the real number and
inflate the listing.

A failed post is logged and retried on the next 30-minute tick. There is no inner retry
loop — the next attempt is already scheduled, and retrying hard against a third-party API
is how rate limits are earned.

### Verifying it works

Check the bot's logs after a restart:

```
📈 Top.gg: posted server count = 56
```

Then reload the public listing at `https://top.gg/bot/<BOT_ID>` — the server count
updates within a few minutes.

Failure modes:

| Log line | Cause |
|---|---|
| `❌ Top.gg: server count post rejected with HTTP 401` | Token wrong, revoked, or belongs to a different bot |
| `❌ Top.gg: server count post rejected with HTTP 404` | Bot ID not found — the listing may have been removed |
| `❌ Top.gg: server count post failed: ...` | Network or DNS failure reaching top.gg |

---

## Security notes

- `TOPGG_TOKEN` is a credential. It is sent only in the `Authorization` header and is
  **never** logged — not in full, not truncated, and not in any error message.
- Keep it in `.env` (which is gitignored) or the deployment's secret store. It must never
  be committed.
- Rotate it from the same Top.gg page if it is ever exposed; there is no other place the
  value is stored.
