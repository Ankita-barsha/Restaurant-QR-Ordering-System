/**
 * Menu offer arithmetic.
 *
 * ONE function derives an offer price, and everything that needs one calls it:
 * the food service when an admin saves a dish, and the order service when a
 * diner is charged. A second implementation anywhere would eventually disagree
 * with this one, and the direction it disagreed in would be a diner shown ₹400
 * and billed ₹500.
 *
 * All of it runs in integer minor units, for the reasons set out in ./money.
 * A 20% discount on ₹19.99 is 3.998 rupees, and only integer arithmetic
 * rounds that to a defensible 4.00 rather than to whatever the float gods
 * decide.
 */

import { AppError } from "./AppError.js";
import { applyPercent, fromMinorUnits, toMinorUnits } from "./money.js";

/** Mirrors the OfferType enum in schema.prisma. */
export type OfferType = "PERCENTAGE" | "FIXED";

/** The offer columns as they are stored on a Food row. */
export interface OfferInput {
  isOfferActive?: boolean | null;
  offerType?: OfferType | null;
  offerValue?: string | number | { toString(): string } | null;
}

/**
 * The discount an offer takes off a price, in minor units.
 *
 * Never negative and never more than the price itself: a discount that
 * exceeded the price would produce a negative line total, and a negative line
 * total in an order is not a bargain, it is a refund the restaurant never
 * agreed to.
 */
const discountMinor = (
  priceMinor: number,
  type: OfferType,
  valueMinor: number
): number => {
  const raw =
    type === "PERCENTAGE"
      ? applyPercent(priceMinor, fromMinorUnits(valueMinor))
      : valueMinor;

  return Math.min(Math.max(raw, 0), priceMinor);
};

/**
 * Parses a stored offer value without throwing.
 *
 * `toMinorUnits` rejects anything it cannot represent exactly, negatives
 * included — correct for a price being written, wrong for a column being read
 * on the menu path. The Decimal column can physically hold a negative that
 * validation would never have let through (a hand-edited row, a restored
 * backup), and one such row must not throw its way up through the menu
 * endpoint and blank the screen for every diner.
 *
 * Null means "unusable", and every caller treats that as "no offer".
 */
const readOfferValue = (
  value: NonNullable<OfferInput["offerValue"]>
): number | null => {
  try {
    return toMinorUnits(value);
  } catch {
    return null;
  }
};

/**
 * The price a dish actually sells at, in minor units.
 *
 * Returns the list price unless an offer is switched on AND fully specified
 * AND parseable. A half-filled or corrupt offer resolves to the list price
 * rather than throwing: this runs for every dish on the menu, and the safe
 * direction to fail is the one that charges full price. The WRITE path
 * validates, which is where a malformed offer is actually caught and reported.
 */
export const effectivePriceMinor = (
  priceMinor: number,
  offer: OfferInput
): number => {
  if (!offer.isOfferActive || !offer.offerType || offer.offerValue == null) {
    return priceMinor;
  }

  const valueMinor = readOfferValue(offer.offerValue);

  if (valueMinor === null) {
    return priceMinor;
  }

  return priceMinor - discountMinor(priceMinor, offer.offerType, valueMinor);
};

/**
 * Derives the offer price to persist, as a decimal string.
 *
 * Returns null when no offer is running, which is what the column holds for a
 * dish at its list price — distinct from "an offer that happens to save
 * nothing".
 */
export const deriveOfferPrice = (
  price: string | { toString(): string },
  offer: OfferInput
): string | null => {
  if (!offer.isOfferActive || !offer.offerType || offer.offerValue == null) {
    return null;
  }

  const priceMinor = toMinorUnits(price);

  return fromMinorUnits(effectivePriceMinor(priceMinor, offer));
};

/**
 * Rejects an offer that cannot mean what the admin intended.
 *
 * Both cases below are clamped harmlessly by the arithmetic above, so this
 * exists purely to tell someone they made a mistake. An admin who types ₹600
 * off a ₹500 dish has fat-fingered a number; silently selling it for nothing
 * and letting them find out from the till is the worse outcome by far.
 *
 * Called on the write path only.
 */
export const assertOfferIsCoherent = (
  price: string | { toString(): string },
  offer: OfferInput
): void => {
  if (!offer.isOfferActive) {
    return;
  }

  if (!offer.offerType || offer.offerValue == null) {
    throw AppError.badRequest(
      "An offer needs both a discount type and a discount value"
    );
  }

  const valueMinor = toMinorUnits(offer.offerValue);

  if (valueMinor <= 0) {
    throw AppError.badRequest("The discount must be greater than zero");
  }

  if (offer.offerType === "PERCENTAGE") {
    // 100% is allowed — a genuinely free promotional item is a real thing.
    if (valueMinor > toMinorUnits("100")) {
      throw AppError.badRequest("A percentage discount cannot exceed 100%");
    }

    return;
  }

  const priceMinor = toMinorUnits(price);

  if (valueMinor > priceMinor) {
    throw AppError.badRequest(
      `A ${fromMinorUnits(valueMinor)} discount is more than the ${fromMinorUnits(
        priceMinor
      )} price of this dish`
    );
  }
};

/**
 * The badge the customer menu shows.
 *
 * Derived when the admin has not written their own, so turning an offer on is
 * enough to get "20% OFF" on the card without a second decision. A custom
 * label wins, which is how "Limited Time Offer" and the like are set.
 */
export const offerBadgeLabel = (
  offer: OfferInput & { offerLabel?: string | null }
): string | null => {
  if (!offer.isOfferActive || !offer.offerType || offer.offerValue == null) {
    return null;
  }

  if (offer.offerLabel?.trim()) {
    return offer.offerLabel.trim();
  }

  const valueMinor = readOfferValue(offer.offerValue);

  if (valueMinor === null) {
    return null;
  }

  if (offer.offerType === "PERCENTAGE") {
    // Whole percentages are by far the common case and "20% OFF" reads better
    // than "20.00% OFF", so the trailing ".00" is dropped.
    const percent = fromMinorUnits(valueMinor).replace(/\.00$/, "");

    return `${percent}% OFF`;
  }

  return "Special Offer";
};
