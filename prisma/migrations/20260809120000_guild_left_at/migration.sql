-- Adds `Guild.leftAt` so a guild the bot was kicked from can be told apart from a
-- live one. Until now nothing recorded departures: the row simply stayed behind, and
-- every "how many servers use this bot" number counted dead installs as live ones.
-- Measured read-only on production on 2026-08-09: 116 Guild rows, 48 guilds actually
-- reachable via GET /users/@me/guilds — 59% of the rows were stale.
--
-- ADDITIVE AND NON-DESTRUCTIVE: nothing is deleted and no existing row is rewritten.
-- Every row starts at NULL, i.e. "assumed live", and the startup reconciliation in
-- src/index.ts stamps the ones that are not in the gateway's guild cache on the first
-- boot after deploy. Doing it in the application rather than here is deliberate — the
-- database has no way of knowing which guilds Discord still hands us.
--
-- RE-RUNNABLE: both statements are guarded, so a partially applied attempt can simply
-- be replayed.

ALTER TABLE "Guild" ADD COLUMN IF NOT EXISTS "leftAt" TIMESTAMP(3);

-- Every guild count filters on `leftAt` from here on, and the reconciliation scans
-- `leftAt IS NULL` on every boot.
CREATE INDEX IF NOT EXISTS "Guild_leftAt_idx" ON "Guild"("leftAt");
