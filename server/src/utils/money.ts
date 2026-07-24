/**
 * Money arithmetic.
 *
 * All calculation happens in INTEGER MINOR UNITS (paise/cents). Floating point
 * cannot represent most decimal fractions exactly, so accumulating a bill in
 * `number` drifts:
 *
 *   0.1 + 0.2            === 0.30000000000000004
 *   19.99 * 3            === 59.97000000000001
 *   parseFloat("19.99")*100 === 1998.9999999999998   <-- and Math.round hides it
 *
 * Integers have none of these problems. Values enter as decimal strings from
 * Prisma, are converted to integers by STRING manipulation (never
 * `parseFloat * 100`), and are formatted back at the very end.
 */

import { AppError } from "./AppError.js";

/** Matches a non-negative decimal with at most two fractional digits. */
const DECIMAL_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a decimal string into integer minor units.
 *
 * Splits on the decimal point rather than multiplying a float, so "19.99"
 * becomes exactly 1999 with no rounding involved.
 */
export const toMinorUnits = (value: string | { toString(): string }): number => {
  const text = String(value).trim();
  const match = DECIMAL_PATTERN.exec(text);

  if (!match) {
    throw AppError.badRequest(`Invalid monetary value: ${text}`);
  }

  const whole = Number(match[1]);
  // "5" -> "50" (5 tenths), "" -> "00". padEnd, not padStart: the digits are
  // fractional, so "1.5" is 50 hundredths, not 5.
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));

  return whole * 100 + fraction;
};

/** Formats integer minor units back into a 2dp decimal string for Prisma. */
export const fromMinorUnits = (minorUnits: number): string => {
  if (!Number.isInteger(minorUnits)) {
    throw new Error(`Expected an integer amount, received ${minorUnits}`);
  }

  const sign = minorUnits < 0 ? "-" : "";
  const absolute = Math.abs(minorUnits);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;

  return `${sign}${whole}.${String(fraction).padStart(2, "0")}`;
};

/**
 * Applies a percentage to an integer amount, rounding half away from zero.
 *
 * Math.round is avoided because it rounds .5 towards positive infinity, which
 * is asymmetric for negatives (discounts, refunds) and would make a credit
 * differ by a paisa from the charge it reverses.
 */
export const applyPercent = (minorUnits: number, percent: string | number): number => {
  const percentMinor = toMinorUnits(String(percent));

  // amount * (percent/100) with both scaled by 100, so divide by 10_000.
  const scaled = minorUnits * percentMinor;
  const quotient = scaled / 10_000;

  return quotient < 0 ? -Math.round(-quotient) : Math.round(quotient);
};
