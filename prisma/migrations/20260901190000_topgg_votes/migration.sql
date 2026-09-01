-- Top.gg vote persistence.
--
-- Top.gg only exposes a rolling 12-hour "has this user voted" check, so vote history is
-- ours to keep or lose. Storing each delivery makes votes rewardable and measurable
-- later; counting them in place would throw away everything except the current total.
--
-- PURELY ADDITIVE: one new table and its indexes. No existing table, column, constraint
-- or row is touched, so this cannot affect any current behaviour and has nothing to
-- back out of on rollback beyond dropping the table.
--
-- No foreign key to "Guild" on purpose: a vote is cast by a user against the *bot* on
-- Top.gg's website and carries no server context, so there is no guild to reference.
-- No foreign key to a user table either — voters need not share a guild with the bot.
--
-- RE-RUNNABLE: every statement is guarded.

CREATE TABLE IF NOT EXISTS "TopggVote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isWeekend" BOOLEAN NOT NULL DEFAULT false,
    "query" TEXT,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopggVote_pkey" PRIMARY KEY ("id")
);

-- "recent votes by this user" — the lookup any reward mechanic needs.
CREATE INDEX IF NOT EXISTS "TopggVote_userId_votedAt_idx" ON "TopggVote"("userId", "votedAt");

-- Time-range scans for reporting.
CREATE INDEX IF NOT EXISTS "TopggVote_votedAt_idx" ON "TopggVote"("votedAt");
