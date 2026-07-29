-- Content management, curated reviews, featured dishes, and the removal of
-- the pickup verification code.
--
-- Four changes that ship together because they are one product change: the
-- welcome page stops being hard-coded, and the waiter stops asking for a code.

-- ---------------------------------------------------------------------------
-- 1. Food.isFeatured — the chef's recommendation.
--
-- Defaults to false, so every existing dish keeps its current behaviour and
-- the welcome page simply shows no featured section until an admin picks one.
-- ---------------------------------------------------------------------------
ALTER TABLE "foods" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "foods_isFeatured_deletedAt_idx" ON "foods"("isFeatured", "deletedAt");

-- ---------------------------------------------------------------------------
-- 2. Drop Order.verificationCode.
--
-- The four-character pickup code is gone from the product: the waiter's screen
-- no longer asks for one and the diner is no longer shown one. Leaving the
-- column would preserve a secret nothing reads and nothing rotates.
--
-- Orders are unaffected otherwise — the column carried no financial meaning
-- and nothing references it.
-- ---------------------------------------------------------------------------
ALTER TABLE "orders" DROP COLUMN "verificationCode";

-- ---------------------------------------------------------------------------
-- 3. site_content — the CMS singleton.
--
-- Single row, enforced the same way restaurant_settings is: the application
-- always writes id = 'singleton'. Every column is nullable because the welcome
-- page falls back to its built-in copy for anything left blank.
-- ---------------------------------------------------------------------------
CREATE TABLE "site_content" (
    "id" TEXT NOT NULL DEFAULT 'singleton',

    "heroEyebrow" TEXT,
    "heroTitle" TEXT,
    "heroLede" TEXT,

    "bannerText" TEXT,

    "featuredEyebrow" TEXT,
    "featuredTitle" TEXT,
    "featuredLede" TEXT,

    "aboutEyebrow" TEXT,
    "aboutTitle" TEXT,
    "aboutBody" TEXT,

    "footerNote" TEXT,

    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("id")
);

-- Seeded here rather than left to the application so the very first read is a
-- plain SELECT. The service still upserts, which keeps a wiped row harmless.
INSERT INTO "site_content" ("id", "updatedAt") VALUES ('singleton', NOW());

-- ---------------------------------------------------------------------------
-- 4. reviews — curated testimonials for the welcome page.
-- ---------------------------------------------------------------------------
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,

    "customerName" TEXT NOT NULL,
    "imageUrl" TEXT,

    "rating" INTEGER NOT NULL DEFAULT 5,
    "comment" TEXT NOT NULL,

    "visitedOn" TIMESTAMP(3),

    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- The public page queries exactly this pair, in this order.
CREATE INDEX "reviews_isVisible_sortOrder_idx" ON "reviews"("isVisible", "sortOrder");
