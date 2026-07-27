-- Adds Order.trackingToken: an unguessable per-order secret.
--
-- orderNumber comes from a sequence and is therefore enumerable, but the
-- public tracking endpoint, the pickup verification code and the online
-- payment flow were all keyed on it. This column replaces it as the key for
-- everything a diner alone is entitled to see.
--
-- Added in three steps because the column is NOT NULL UNIQUE and existing
-- rows need a value: add nullable, backfill, then tighten.

-- 1. Add nullable.
ALTER TABLE "orders" ADD COLUMN "trackingToken" TEXT;

-- 2. Backfill existing rows with a distinct random value each.
--    gen_random_uuid() is built into PostgreSQL 13+, so no extension is
--    required. Two uuids give 256 bits, matching the 32 random bytes the
--    application generates for new orders.
UPDATE "orders"
SET "trackingToken" = replace(gen_random_uuid()::text, '-', '')
                   || replace(gen_random_uuid()::text, '-', '')
WHERE "trackingToken" IS NULL;

-- 3. Tighten to NOT NULL and add the unique index.
ALTER TABLE "orders" ALTER COLUMN "trackingToken" SET NOT NULL;

CREATE UNIQUE INDEX "orders_trackingToken_key" ON "orders"("trackingToken");
