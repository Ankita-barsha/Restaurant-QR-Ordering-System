/**
 * Menu offer arithmetic.
 *
 * The cases here are the ones where being subtly wrong is expensive and
 * invisible: a rounding rule that drifts a paisa on every discounted line, a
 * discount larger than the price producing a negative bill, and a half-filled
 * offer row taking the whole menu down.
 */

import { describe, expect, it } from "vitest";

import { AppError } from "./AppError.js";
import { fromMinorUnits, toMinorUnits } from "./money.js";
import {
  assertOfferIsCoherent,
  deriveOfferPrice,
  effectivePriceMinor,
  offerBadgeLabel,
} from "./offer.js";

describe("deriveOfferPrice", () => {
  it("computes the two examples from the brief", () => {
    // ₹500 with 20% off is ₹400.
    expect(
      deriveOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "20",
      })
    ).toBe("400.00");

    // ₹500 with ₹100 off is also ₹400.
    expect(
      deriveOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "100",
      })
    ).toBe("400.00");
  });

  it("returns null when no offer is running", () => {
    expect(deriveOfferPrice("500.00", { isOfferActive: false })).toBeNull();

    // Null, not "500.00": the column distinguishes "no offer" from "an offer
    // that happens to save nothing".
    expect(
      deriveOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: null,
      })
    ).toBeNull();
  });

  it("rounds a fractional discount half away from zero, as tax does", () => {
    // 20% of 19.99 is 3.998 -> 4.00 off, leaving 15.99.
    expect(
      deriveOfferPrice("19.99", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "20",
      })
    ).toBe("15.99");
  });

  it("does not drift where float arithmetic would", () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point.
    expect(
      deriveOfferPrice("0.30", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "0.10",
      })
    ).toBe("0.20");
  });

  it("allows a 100% discount, which is a real promotional item", () => {
    expect(
      deriveOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "100",
      })
    ).toBe("0.00");
  });
});

describe("effectivePriceMinor", () => {
  const price = toMinorUnits("500.00");

  it("never returns a negative price, however large the discount", () => {
    // A negative line total is not a bargain; it is a refund nobody agreed to.
    expect(
      effectivePriceMinor(price, {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "9999",
      })
    ).toBe(0);
  });

  it("ignores a negative discount rather than inflating the price", () => {
    expect(
      effectivePriceMinor(price, {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "-50",
      })
    ).toBe(price);
  });

  it("falls back to the list price for a half-filled offer", () => {
    // This runs on the read path for every dish on the menu. A malformed row
    // must degrade to full price, never throw and blank the menu.
    expect(
      effectivePriceMinor(price, { isOfferActive: true, offerType: "PERCENTAGE" })
    ).toBe(price);

    expect(
      effectivePriceMinor(price, { isOfferActive: true, offerValue: "20" })
    ).toBe(price);
  });

  it("charges the list price when the offer is switched off but still stored", () => {
    // Switching an offer off keeps its settings for next season; it must not
    // keep applying them.
    expect(
      effectivePriceMinor(price, {
        isOfferActive: false,
        offerType: "PERCENTAGE",
        offerValue: "20",
      })
    ).toBe(price);
  });

  it("matches what an order line is charged", () => {
    const unit = effectivePriceMinor(toMinorUnits("349.00"), {
      isOfferActive: true,
      offerType: "PERCENTAGE",
      offerValue: "10",
    });

    expect(fromMinorUnits(unit * 3)).toBe("942.30");
  });
});

describe("assertOfferIsCoherent", () => {
  it("passes a well-formed offer", () => {
    expect(() =>
      assertOfferIsCoherent("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "100",
      })
    ).not.toThrow();
  });

  it("ignores everything when the offer is off", () => {
    expect(() =>
      assertOfferIsCoherent("500.00", {
        isOfferActive: false,
        offerType: "FIXED",
        offerValue: "9999",
      })
    ).not.toThrow();
  });

  it("rejects a fixed discount larger than the price", () => {
    // Clamping would silently sell a ₹500 dish for nothing.
    expect(() =>
      assertOfferIsCoherent("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "600",
      })
    ).toThrow(AppError);
  });

  it("rejects a percentage over 100", () => {
    expect(() =>
      assertOfferIsCoherent("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "120",
      })
    ).toThrow(AppError);
  });

  it("rejects a zero or missing discount", () => {
    expect(() =>
      assertOfferIsCoherent("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "0",
      })
    ).toThrow(AppError);

    expect(() =>
      assertOfferIsCoherent("500.00", { isOfferActive: true })
    ).toThrow(AppError);
  });
});

describe("offerBadgeLabel", () => {
  it("derives a percentage badge without the trailing decimals", () => {
    expect(
      offerBadgeLabel({
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "20.00",
      })
    ).toBe("20% OFF");
  });

  it("keeps a genuinely fractional percentage", () => {
    expect(
      offerBadgeLabel({
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "12.50",
      })
    ).toBe("12.50% OFF");
  });

  it("labels a fixed discount generically", () => {
    expect(
      offerBadgeLabel({
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "100",
      })
    ).toBe("Special Offer");
  });

  it("lets a custom label win", () => {
    expect(
      offerBadgeLabel({
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "20",
        offerLabel: "Limited Time Offer",
      })
    ).toBe("Limited Time Offer");
  });

  it("is null when nothing is on offer", () => {
    expect(offerBadgeLabel({ isOfferActive: false })).toBeNull();
  });
});
