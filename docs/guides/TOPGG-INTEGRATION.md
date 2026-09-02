# Top.gg Integration

RaidPresence is listed on Top.gg. This guide covers the two integration points, where to
get each credential, and what happens when they are absent.

Both are **optional and independently gated**. A deployment with neither variable set
behaves exactly as it did before the integration existed: one informational log line at
startup, and nothing else.

| Variable | Enables | Status |
|---|---|---|
| `TOPGG_TOKEN` | Posting the server count to the listing | Shipped |
| `TOPGG_WEBHOOK_SECRET` | Receiving vote webhooks | Shipped |

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

---

## Vote webhook

Top.gg only exposes a rolling 12-hour "has this user voted" check. It does **not** keep a
vote history you can query later, so any vote not captured as it arrives is gone. The
webhook records each vote into the `TopggVote` table so votes can be rewarded and measured
later.

### Choosing `TOPGG_WEBHOOK_SECRET`

Unlike the API token, **you invent this value** — it is a shared secret, not something
Top.gg issues.

1. Generate a long random string:
   ```bash
   openssl rand -hex 32
   ```
2. Put it in the bot's `.env` as `TOPGG_WEBHOOK_SECRET`.
3. Go to `https://top.gg/bot/<BOT_ID>/webhooks`.
4. Set **Webhook URL** to your public endpoint, e.g. `https://example.com/topgg/vote`.
5. Paste the **same string** into the **Authorization** field on that page.
6. Save.

> Reminder: **Authorization** (this secret, chosen by you, verifies incoming webhooks) and
> **Token** (issued by Top.gg, authenticates the outgoing server-count post) are two
> different values on the same page. Swapping them silently breaks both directions.

### Configuration

```bash
TOPGG_WEBHOOK_SECRET=the_same_long_random_string
TOPGG_WEBHOOK_PORT=8080   # optional, defaults to 8080
```

### Behaviour

- **Secret unset:** the bot logs `ℹ️ Top.gg: TOPGG_WEBHOOK_SECRET is not set — the vote
  webhook is disabled` once at startup. **No HTTP port is opened at all** — there is no
  listening socket and no endpoint to reach.
- **Secret set:** the bot listens on `TOPGG_WEBHOOK_PORT` and serves `POST /topgg/vote`.
  Nothing else is served on that port; every other path and method returns 404.

### Exposing it

Top.gg requires a **public HTTPS URL**, so put the port behind the reverse proxy that
already terminates TLS rather than publishing it to the host. `docker-compose.yml`
contains a commented `ports:` block for the direct-exposure case; it is deliberately left
commented so that merging the integration changes nothing about the host's open ports.

Example nginx location:

```nginx
location /topgg/vote {
    proxy_pass http://127.0.0.1:8080/topgg/vote;
    proxy_set_header Authorization $http_authorization;
}
```

Forwarding the `Authorization` header is essential — it *is* the authentication.

### Responses

| Status | Meaning | Does Top.gg retry? |
|---|---|---|
| `204` | Vote recorded | No |
| `401` | Missing or wrong `Authorization` header | No |
| `400` | Malformed payload (no `user` or no `type`) | No — it would never become valid |
| `500` | The vote was valid but could not be persisted | Yes, which is what we want |

### Testing it

The Top.gg webhook page has a **Test** button. It sends a payload with `type: "test"`
instead of `"upvote"`. That is stored as a normal row with `type = 'test'` — deliberately
recorded rather than discarded, so a test delivery is visibly a test instead of silently
missing. Confirm with:

```sql
SELECT "userId", "type", "isWeekend", "votedAt"
FROM "TopggVote"
ORDER BY "votedAt" DESC
LIMIT 5;
```

### Security notes

- The `Authorization` header is compared to the secret in **constant time**
  (`crypto.timingSafeEqual`), so a wrong value cannot be recovered by timing the response.
- Neither the configured secret nor the value a caller supplied is ever written to the log.
- A rejected request gets no detail in its response beyond the status code.
- If `TOPGG_WEBHOOK_SECRET` is unset, every request is rejected with 401 — an absent
  secret never means "allow everything". (There is a test for exactly this.)
- Request bodies are capped at 16 KB.
