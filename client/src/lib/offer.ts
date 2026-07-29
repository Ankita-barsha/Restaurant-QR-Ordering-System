/**
 * Menu offers, on the client.
 *
 * Mirrors server/src/utils/offer.ts deliberately, for the same reason
 * lib/money mirrors the server's arithmetic: the diner is shown a price here
 * and charged one there, and if the two ever disagree it is the restaurant
 * that has to explain itself at the table.
 *
 * The admin form additionally needs to PREVIEW an offer price for a discount
 * that has not been saved yet, which is the one thing the server's stored
 * `offerPrice` cannot answer — hence `previewOfferPrice` below.
 */

import { applyPercent, fromMinor, toMinor } from "./money";
import type { Food, OfferType } from "../types/api";

/** The offer fields, loose enough for a half-filled admin form. */
export interface OfferShape {
  isOfferActive?: boolean | null;
  offerType?: OfferType | null;
  offerValue?: string | null;
  offerLabel?: string | null;
}

/** Whether a dish is actually selling below its list price right now. */
export const hasOffer = (food: Pick<Food, "isOfferActive" | "offerPrice">): boolean =>
  Boolean(food.isOfferActive && food.offerPrice);

/**
 * What a dish costs — the offer price when one is running, else the list price.
 *
 * Everything that displays or sums a menu price goes through here, so a screen
 * cannot accidentally quote the pre-discount figure. Reads the server's stored
 * `offerPrice` rather than re-deriving it: the server is the authority on what
 * it will bill, and re-deriving here would be a second implementation to drift.
 */
export const effectivePrice = (
  food: Pick<Food, "price" | "isOfferActive" | "offerPrice">
): string => (hasOffer(food) ? (food.offerPrice as string) : food.price);

/** The list price, but only when it differs — what to strike through. */
export const strikethroughPrice = (
  food: Pick<Food, "price" | "isOfferActive" | "offerPrice">
): string | null => (hasOffer(food) ? food.price : null);

/**
 * The badge text.
 *
 * A custom label wins; otherwise it is derived from the discount, so turning
 * an offer on is enough to get "20% OFF" without a second decision. Mirrors
 * offerBadgeLabel on the server.
 */
export const offerBadge = (
  food: Pick<Food, "isOfferActive" | "offerType" | "offerValue" | "offerLabel">
): string | null => {
  if (!food.isOfferActive || !food.offerType || food.offerValue === null) {
    return null;
  }

  if (food.offerLabel?.trim()) {
    return food.offerLabel.trim();
  }

  if (food.offerType === "PERCENTAGE") {
    // "20% OFF" reads better than "20.00% OFF", and whole percentages are by
    // far the common case.
    return `${food.offerValue.replace(/\.00$/, "")}% OFF`;
  }

  return "Special Offer";
};

/**
 * How much a diner saves, for the "you save ₹100" line.
 *
 * In integer paise, so the saving on a long order adds up exactly.
 */
export const savingMinor = (
  food: Pick<Food, "price" | "isOfferActive" | "offerPrice">
): number =>
  hasOffer(food) ? toMinor(food.price) - toMinor(food.offerPrice as string) : 0;

/**
 * The offer price for a discount the admin is still typing.
 *
 * This is the ONE place the client derives an offer price rather than reading
 * the server's. It powers the live preview in the menu form, which has to
 * answer "what will this sell for?" before anything has been saved.
 *
 * Deliberately mirrors the server's rules exactly — clamped to the price, never
 * negative, rounded half away from zero — so the number the admin sees while
 * typing is the number that gets stored when they press save. Returns null
 * when the offer is not yet complete enough to price.
 */
export const previewOfferPrice = (
  price: string,
  offer: OfferShape
): string | null => {
  if (!offer.isOfferActive || !offer.offerType || !offer.offerValue?.trim()) {
    return null;
  }

  const priceMinor = toMinor(price);
  const valueMinor = toMinor(offer.offerValue);

  if (priceMinor <= 0 || valueMinor <= 0) {
    return null;
  }

  const raw =
    offer.offerType === "PERCENTAGE"
      ? applyPercent(priceMinor, offer.offerValue)
      : valueMinor;

  const discount = Math.min(Math.max(raw, 0), priceMinor);

  return fromMinor(priceMinor - discount);
};

/**
 * Why a preview cannot be shown, phrased for the admin.
 *
 * Mirrors the server's assertOfferIsCoherent so the form says "that is more
 * than the price" as it is typed, rather than after a round trip that returns
 * a 400. The server still enforces it — this only moves the message earlier.
 */
export const offerProblem = (price: string, offer: OfferShape): string | null => {
  if (!offer.isOfferActive) {
    return null;
  }

  if (!offer.offerType || !offer.offerValue?.trim()) {
    return "Choose a discount type and enter a value.";
  }

  const priceMinor = toMinor(price);
  const valueMinor = toMinor(offer.offerValue);

  if (valueMinor <= 0) {
    return "The discount must be greater than zero.";
  }

  if (offer.offerType === "PERCENTAGE") {
    return valueMinor > toMinor("100")
      ? "A percentage discount cannot exceed 100%."
      : null;
  }

  if (priceMinor <= 0) {
    return "Enter the dish's price first.";
  }

  return valueMinor > priceMinor
    ? "That discount is more than the price of the dish."
    : null;
};
