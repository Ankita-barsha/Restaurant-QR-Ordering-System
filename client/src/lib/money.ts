/**
 * Money arithmetic, in integer minor units (paise).
 *
 * Mirrors server/src/utils/money.ts deliberately: the diner sees a total before
 * they order and the server calculates the one they are charged, and the two
 * have to agree. When the cart estimated with floats and the server used
 * integers, the same basket could differ by a paisa — enough for a guest to
 * think they had been overcharged.
 *
 * Never `parseFloat(price) * 100`: binary floating point cannot represent most
 * decimal fractions, so "19.99" becomes 1998.9999999999998 and Math.round only
 * hides it until the errors accumulate.
 */

/** Matches a decimal with at most two fractional digits. */
const DECIMAL_PATTERN = /^-?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a decimal string into integer paise, by splitting on the point rather
 * than multiplying a float.
 *
 * Returns 0 for anything unparseable. The cart is an estimate on a screen, not
 * a ledger: a malformed price should show a wrong number, not throw an
 * exception that blanks the page mid-order.
 */
export const toMinor = (value: string | number): number => {
  const text = String(value).trim();
  const match = DECIMAL_PATTERN.exec(text);

  if (!match) {
    return 0;
  }

  const sign = text.startsWith("-") ? -1 : 1;
  // padEnd, not padStart: the digits are fractional, so "1.5" is 50 paise.
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));

  return sign * (Number(match[1]) * 100 + fraction);
};

/** Formats integer paise back into a 2dp decimal string. */
export const fromMinor = (minor: number): string => {
  const rounded = Math.round(minor);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);

  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
};

/**
 * Applies a percentage to an integer amount.
 *
 * Both operands are scaled by 100, so the product is scaled by 10,000 and the
 * division brings it back. Matches the server's rounding exactly — half away
 * from zero — so the estimate and the invoice round the same way.
 */
export const applyPercent = (minor: number, percent: string | number): number => {
  const quotient = (minor * toMinor(percent)) / 10_000;

  return quotient < 0 ? -Math.round(-quotient) : Math.round(quotient);
};

/** Sums priced lines exactly. */
export const sumLinesMinor = (
  lines: { price: string; quantity: number }[]
): number => lines.reduce((sum, line) => sum + toMinor(line.price) * line.quantity, 0);

/**
 * The bill a diner is quoted before ordering.
 *
 * Tax AND service charge, both taken on the subtotal, exactly as the server
 * computes them. The cart previously applied tax alone, so on a menu with a
 * service charge configured every diner was quoted less than they were then
 * asked to pay — the one direction of error a restaurant cannot afford.
 */
export const quoteTotals = (
  subtotalMinor: number,
  taxPercent: string | number,
  serviceChargePercent: string | number
) => {
  const taxMinor = applyPercent(subtotalMinor, taxPercent);
  const serviceMinor = applyPercent(subtotalMinor, serviceChargePercent);

  return {
    subtotal: fromMinor(subtotalMinor),
    tax: fromMinor(taxMinor),
    serviceCharge: fromMinor(serviceMinor),
    total: fromMinor(subtotalMinor + taxMinor + serviceMinor),
  };
};

/**
 * Calculates dynamic advance payment details for orders > ₹3,000.
 *
 * Rules:
 * - Orders <= ₹3,000: No advance required (0%).
 * - Orders > ₹3,000: Base 20% advance + 10% for every additional ₹1,000 above ₹3,000 (capped at 100%).
 */
export const calculateAdvanceDetails = (totalMinor: number, thresholdTaka = 3000) => {
  const totalTaka = totalMinor / 100;
  if (totalTaka <= thresholdTaka) {
    return {
      isAdvanceRequired: false,
      advancePercent: 0,
      advanceMinor: 0,
      remainingMinor: totalMinor,
    };
  }

  const extraThousands = Math.floor((totalTaka - thresholdTaka) / 1000);
  const rawPercent = 20 + extraThousands * 10;
  const advancePercent = Math.min(rawPercent, 100);
  const advanceMinor = Math.round((totalMinor * advancePercent) / 100);
  const remainingMinor = totalMinor - advanceMinor;

  return {
    isAdvanceRequired: true,
    advancePercent,
    advanceMinor,
    remainingMinor,
  };
};
