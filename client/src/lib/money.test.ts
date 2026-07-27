/**
 * The quote a diner sees before ordering.
 *
 * Two things are being pinned down. First, that the arithmetic is exact —
 * these are the same cases the server's money tests cover, because the two
 * must agree to the paisa. Second, that the quote includes the SERVICE CHARGE:
 * omitting it under-quoted every basket, which is the one direction of error a
 * restaurant cannot afford.
 */

import { describe, expect, it } from "vitest";

import {
  applyPercent,
  fromMinor,
  quoteTotals,
  sumLinesMinor,
  toMinor,
} from "./money";

describe("toMinor", () => {
  it("parses decimal strings exactly", () => {
    expect(toMinor("0")).toBe(0);
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("349.00")).toBe(34900);
  });

  it("reads a single decimal digit as tenths", () => {
    expect(toMinor("1.5")).toBe(150);
  });

  it("does not drift where parseFloat would", () => {
    // parseFloat("19.99") * 100 === 1998.9999999999998
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("0.1") + toMinor("0.2")).toBe(toMinor("0.30"));
  });

  it("handles negatives, for refunds shown to the diner", () => {
    expect(toMinor("-19.99")).toBe(-1999);
  });

  it("returns zero rather than throwing on junk", () => {
    // A cart is a screen, not a ledger: a malformed price should show a wrong
    // number, not blank the page mid-order with an exception.
    expect(toMinor("abc")).toBe(0);
    expect(toMinor("")).toBe(0);
  });
});

describe("fromMinor", () => {
  it("always renders two decimal places, with the sign", () => {
    expect(fromMinor(0)).toBe("0.00");
    expect(fromMinor(5)).toBe("0.05");
    expect(fromMinor(1999)).toBe("19.99");
    expect(fromMinor(-1999)).toBe("-19.99");
  });
});

describe("applyPercent", () => {
  it("rounds half away from zero, exactly as the server does", () => {
    expect(applyPercent(10000, "18")).toBe(1800);
    expect(applyPercent(10000, "2.5")).toBe(250);
    expect(applyPercent(1, "50")).toBe(1);
    expect(applyPercent(-1, "50")).toBe(-1);
  });
});

describe("sumLinesMinor", () => {
  it("multiplies in paise, not in floats", () => {
    // 19.99 x 3 as floats is 59.97000000000001.
    expect(sumLinesMinor([{ price: "19.99", quantity: 3 }])).toBe(5997);
  });

  it("adds several lines exactly", () => {
    // 698.00 + 0.10 + 0.20 = 698.30. As floats, the last two are the classic
    // 0.1 + 0.2 = 0.30000000000000004.
    expect(
      sumLinesMinor([
        { price: "349.00", quantity: 2 },
        { price: "0.10", quantity: 1 },
        { price: "0.20", quantity: 1 },
      ])
    ).toBe(69830);
  });

  it("is zero for an empty cart", () => {
    expect(sumLinesMinor([])).toBe(0);
  });
});

describe("quoteTotals", () => {
  it("charges the service charge as well as the tax", () => {
    // The regression this file exists for. On a 349.00 basket with 5% tax and
    // 10% service, quoting tax alone showed 366.45 for a bill of 401.35 —
    // nearly 35 rupees short.
    const quote = quoteTotals(toMinor("349.00"), "5", "10");

    expect(quote.subtotal).toBe("349.00");
    expect(quote.tax).toBe("17.45");
    expect(quote.serviceCharge).toBe("34.90");
    expect(quote.total).toBe("401.35");
  });

  it("adds up: subtotal + tax + service === total", () => {
    for (const [subtotal, tax, service] of [
      ["349.00", "5", "10"],
      ["19.99", "18", "0"],
      ["1234.56", "2.5", "7.5"],
      ["0.01", "18", "10"],
    ] as const) {
      const quote = quoteTotals(toMinor(subtotal), tax, service);

      expect(toMinor(quote.total)).toBe(
        toMinor(quote.subtotal) + toMinor(quote.tax) + toMinor(quote.serviceCharge)
      );
    }
  });

  it("charges nothing extra when both rates are zero", () => {
    const quote = quoteTotals(toMinor("100.00"), "0", "0");

    expect(quote.tax).toBe("0.00");
    expect(quote.serviceCharge).toBe("0.00");
    expect(quote.total).toBe("100.00");
  });

  it("takes both charges on the SUBTOTAL, never compounding them", () => {
    // Service charge must not be taxed, and tax must not be serviced. On 100
    // with 10% each that is 120, not 121.
    const quote = quoteTotals(toMinor("100.00"), "10", "10");

    expect(quote.total).toBe("120.00");
  });

  it("quotes an empty cart as zero rather than NaN", () => {
    const quote = quoteTotals(0, "5", "10");

    expect(quote.total).toBe("0.00");
  });
});
