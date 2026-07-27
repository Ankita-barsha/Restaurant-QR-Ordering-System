/**
 * Money arithmetic.
 *
 * These are the assertions the whole billing story rests on. Every case here
 * is one that plain float arithmetic gets wrong.
 */

import { describe, expect, it } from "vitest";

import { AppError } from "./AppError.js";
import { applyPercent, fromMinorUnits, toMinorUnits } from "./money.js";

describe("toMinorUnits", () => {
  it("parses whole and fractional amounts exactly", () => {
    expect(toMinorUnits("0")).toBe(0);
    expect(toMinorUnits("19.99")).toBe(1999);
    expect(toMinorUnits("349.00")).toBe(34900);
    expect(toMinorUnits("1000")).toBe(100000);
  });

  it("treats a single decimal digit as TENTHS, not hundredths", () => {
    // "1.5" is one rupee fifty paise. Reading it as 1 rupee 5 paise would
    // undercharge by a factor of ten on every price written with one decimal.
    expect(toMinorUnits("1.5")).toBe(150);
  });

  it("does not drift where parseFloat would", () => {
    // parseFloat("19.99") * 100 === 1998.9999999999998
    expect(toMinorUnits("19.99")).toBe(1999);
    // 0.1 + 0.2 !== 0.3
    expect(toMinorUnits("0.1") + toMinorUnits("0.2")).toBe(toMinorUnits("0.30"));
  });

  it("accepts anything with a toString, which is how Prisma Decimals arrive", () => {
    expect(toMinorUnits({ toString: () => "42.50" })).toBe(4250);
  });

  it("rejects values it cannot represent exactly", () => {
    // Three decimal places would have to be rounded, and silently rounding
    // money is how a bill stops reconciling.
    expect(() => toMinorUnits("1.005")).toThrow(AppError);
    expect(() => toMinorUnits("abc")).toThrow(AppError);
    expect(() => toMinorUnits("")).toThrow(AppError);
  });
});

describe("fromMinorUnits", () => {
  it("always renders two decimal places", () => {
    expect(fromMinorUnits(0)).toBe("0.00");
    expect(fromMinorUnits(5)).toBe("0.05");
    expect(fromMinorUnits(50)).toBe("0.50");
    expect(fromMinorUnits(1999)).toBe("19.99");
  });

  it("keeps the sign on refunds and discounts", () => {
    expect(fromMinorUnits(-1999)).toBe("-19.99");
    expect(fromMinorUnits(-5)).toBe("-0.05");
  });

  it("round-trips through toMinorUnits", () => {
    for (const value of ["0.00", "0.01", "19.99", "1234.56"]) {
      expect(fromMinorUnits(toMinorUnits(value))).toBe(value);
    }
  });

  it("refuses a non-integer, which means the caller already lost precision", () => {
    expect(() => fromMinorUnits(19.99)).toThrow();
  });
});

describe("applyPercent", () => {
  it("applies whole and fractional rates", () => {
    expect(applyPercent(10000, "5")).toBe(500);
    expect(applyPercent(10000, "18")).toBe(1800);
    expect(applyPercent(10000, "2.5")).toBe(250);
  });

  it("rounds half AWAY from zero, symmetrically", () => {
    // 5% of 1.05 is 0.0525 -> 5 paise; the half-cases must not favour one
    // direction, or a refund would differ from the charge it reverses.
    expect(applyPercent(1, "50")).toBe(1); // 0.5 -> 1
    expect(applyPercent(-1, "50")).toBe(-1); // -0.5 -> -1
  });

  it("returns nothing on a zero rate, and nothing on a zero amount", () => {
    expect(applyPercent(12345, "0")).toBe(0);
    expect(applyPercent(0, "18")).toBe(0);
  });

  it("matches how an order total is assembled", () => {
    // A 349.00 dish with 5% tax and 10% service: 34900 + 1745 + 3490.
    const subtotal = toMinorUnits("349.00");
    const tax = applyPercent(subtotal, "5");
    const service = applyPercent(subtotal, "10");

    expect(fromMinorUnits(subtotal + tax + service)).toBe("401.35");
  });
});
