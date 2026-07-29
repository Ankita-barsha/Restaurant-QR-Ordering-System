-- Promotional offers on menu items.
--
-- `foods.price` keeps its meaning exactly: it is the LIST price and an offer
-- never rewrites it. The discount is described by three columns and the final
-- price is derived from them by the application, which is the only writer.
--
-- Every column is nullable or defaulted, so existing rows are untouched and
-- every dish continues to sell at `price` until an admin turns an offer on.

CREATE TYPE "OfferType" AS ENUM ('PERCENTAGE', 'FIXED');

ALTER TABLE "foods"
  ADD COLUMN "isOfferActive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "offerType"     "OfferType",
  ADD COLUMN "offerValue"    DECIMAL(10,2),
  -- Derived from price + offerType + offerValue by the food service. Stored
  -- so the menu can sort and filter on what a dish actually costs without
  -- every consumer re-deriving it and eventually disagreeing.
  ADD COLUMN "offerPrice"    DECIMAL(10,2),
  -- Optional badge wording. Blank falls back to a label derived from the
  -- discount itself, so an admin never has to type one.
  ADD COLUMN "offerLabel"    TEXT;

-- The customer menu's "on offer" filter queries exactly this pair.
CREATE INDEX "foods_isOfferActive_deletedAt_idx" ON "foods"("isOfferActive", "deletedAt");
