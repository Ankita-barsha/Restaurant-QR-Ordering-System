/**
 * Menu offers, on the client.
 *
 * The preview shown in the admin form and the price the server stores are two
 * implementations of one rule, so these assertions are the ones that keep them
 * from drifting. Every expectation here matches a case in the server's
 * offer.test.ts by design — if one file changes, the other must.
 */

import { describe, expect, it } from "vitest";

import {
  effectivePrice,
  hasOffer,
  offerBadge,
  offerProblem,
  previewOfferPrice,
  savingMinor,
} from "./offer";

/** A dish as the API returns it, with only the fields these helpers read. */
const dish = (overrides: Partial<Parameters<typeof offerBadge>[0]> & {
  price?: string;
  offerPrice?: string | null;
}) => ({
  price: "500.00",
  isOfferActive: false,
  offerType: null,
  offerValue: null,
  offerPrice: null,
  offerLabel: null,
  ...overrides,
});

describe("effectivePrice", () => {
  it("is the list price with no offer", () => {
    expect(effectivePrice(dish({}))).toBe("500.00");
  });

  it("is the offer price while an offer runs", () => {
    expect(
      effectivePrice(dish({ isOfferActive: true, offerPrice: "400.00" }))
    ).toBe("400.00");
  });

  it("falls back to the list price if the offer price is missing", () => {
    // A half-written row must never make a dish look free.
    expect(effectivePrice(dish({ isOfferActive: true, offerPrice: null }))).toBe(
      "500.00"
    );
  });

  it("ignores a stored offer price once the offer is switched off", () => {
    expect(
      effectivePrice(dish({ isOfferActive: false, offerPrice: "400.00" }))
    ).toBe("500.00");
  });
});

describe("hasOffer and savingMinor", () => {
  it("reports the saving in exact paise", () => {
    const food = dish({ isOfferActive: true, offerPrice: "400.00" });

    expect(hasOffer(food)).toBe(true);
    expect(savingMinor(food)).toBe(10_000);
  });

  it("saves nothing when no offer runs", () => {
    expect(savingMinor(dish({}))).toBe(0);
  });
});

describe("previewOfferPrice", () => {
  it("computes both examples from the brief", () => {
    expect(
      previewOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "20",
      })
    ).toBe("400.00");

    expect(
      previewOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "100",
      })
    ).toBe("400.00");
  });

  it("rounds exactly as the server does", () => {
    // 20% of 19.99 is 3.998 -> 4.00 off. The server's offer.test.ts asserts
    // the same figure; a different rounding rule here would show the admin a
    // price the dish never sells at.
    expect(
      previewOfferPrice("19.99", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "20",
      })
    ).toBe("15.99");
  });

  it("never previews below zero", () => {
    expect(
      previewOfferPrice("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "9999",
      })
    ).toBe("0.00");
  });

  it("shows nothing until the offer is complete enough to price", () => {
    expect(previewOfferPrice("500.00", { isOfferActive: false })).toBeNull();
    expect(
      previewOfferPrice("500.00", { isOfferActive: true, offerType: "FIXED" })
    ).toBeNull();
    expect(
      previewOfferPrice("", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "100",
      })
    ).toBeNull();
  });
});

describe("offerProblem", () => {
  it("is silent on a well-formed offer", () => {
    expect(
      offerProblem("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "100",
      })
    ).toBeNull();
  });

  it("catches the mistakes the server would reject, before the round trip", () => {
    expect(
      offerProblem("500.00", {
        isOfferActive: true,
        offerType: "FIXED",
        offerValue: "600",
      })
    ).toMatch(/more than the price/i);

    expect(
      offerProblem("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "120",
      })
    ).toMatch(/cannot exceed 100/i);

    expect(
      offerProblem("500.00", {
        isOfferActive: true,
        offerType: "PERCENTAGE",
        offerValue: "0",
      })
    ).toMatch(/greater than zero/i);
  });

  it("says nothing at all when the offer is switched off", () => {
    expect(
      offerProblem("500.00", {
        isOfferActive: false,
        offerType: "FIXED",
        offerValue: "9999",
      })
    ).toBeNull();
  });
});

describe("offerBadge", () => {
  it("derives a percentage badge", () => {
    expect(
      offerBadge(
        dish({ isOfferActive: true, offerType: "PERCENTAGE", offerValue: "20.00" })
      )
    ).toBe("20% OFF");
  });

  it("labels a fixed discount generically", () => {
    expect(
      offerBadge(dish({ isOfferActive: true, offerType: "FIXED", offerValue: "100" }))
    ).toBe("Special Offer");
  });

  it("lets a custom label win", () => {
    expect(
      offerBadge(
        dish({
          isOfferActive: true,
          offerType: "PERCENTAGE",
          offerValue: "20",
          offerLabel: "Limited Time Offer",
        })
      )
    ).toBe("Limited Time Offer");
  });

  it("is null with no offer", () => {
    expect(offerBadge(dish({}))).toBeNull();
  });
});
