/**
 * The order status state machine.
 *
 * Pure logic, so it is tested without a database. What matters here is what is
 * REFUSED: the UI hides illegal buttons, but the UI is not a guarantee, and a
 * served order that can be reopened is a bill that can be changed after the
 * customer has left.
 */

import { describe, expect, it } from "vitest";

import { canTransition, evaluateHold } from "./order.service.js";
import type { OrderStatus } from "../validations/order.validation.js";

const ALL: OrderStatus[] = [
  "NEEDS_APPROVAL",
  "AWAITING_ADVANCE_PAYMENT",
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "SERVED",
  "CANCELLED",
];

describe("canTransition", () => {
  it("walks the happy path one step at a time", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "PREPARING")).toBe(true);
    expect(canTransition("PREPARING", "READY")).toBe(true);
    expect(canTransition("READY", "SERVED")).toBe(true);
  });

  it("refuses to skip a step", () => {
    expect(canTransition("PENDING", "PREPARING")).toBe(false);
    expect(canTransition("PENDING", "READY")).toBe(false);
    expect(canTransition("PENDING", "SERVED")).toBe(false);
    expect(canTransition("CONFIRMED", "SERVED")).toBe(false);
  });

  it("refuses to go backwards", () => {
    expect(canTransition("CONFIRMED", "PENDING")).toBe(false);
    expect(canTransition("PREPARING", "CONFIRMED")).toBe(false);
    expect(canTransition("READY", "PREPARING")).toBe(false);
    expect(canTransition("SERVED", "READY")).toBe(false);
  });

  it("allows cancelling from anywhere the order is still live", () => {
    for (const from of ["PENDING", "CONFIRMED", "PREPARING", "READY"] as const) {
      expect(canTransition(from, "CANCELLED")).toBe(true);
    }
  });

  it("treats SERVED and CANCELLED as terminal", () => {
    // Nothing leaves either state. A served order that could be reopened is a
    // bill that could be changed after the customer has paid and left; a
    // cancelled one that could be revived is food nobody is cooking.
    for (const terminal of ["SERVED", "CANCELLED"] as const) {
      for (const to of ALL) {
        expect(canTransition(terminal, to)).toBe(false);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("lets a held order be released or voided, and nothing else", () => {
    expect(canTransition("NEEDS_APPROVAL", "AWAITING_ADVANCE_PAYMENT")).toBe(true);
    expect(canTransition("NEEDS_APPROVAL", "PENDING")).toBe(true);
    expect(canTransition("AWAITING_ADVANCE_PAYMENT", "PENDING")).toBe(true);
    expect(canTransition("NEEDS_APPROVAL", "CANCELLED")).toBe(true);
    expect(canTransition("AWAITING_ADVANCE_PAYMENT", "CANCELLED")).toBe(true);
  });

  it("never lets a held order reach the kitchen directly", () => {
    // The entire point of a hold is that the kitchen has not been told. A jump
    // from a hold to CONFIRMED or beyond would be the gate silently failing
    // open, which is the one failure mode that costs the restaurant food.
    for (const held of ["NEEDS_APPROVAL", "AWAITING_ADVANCE_PAYMENT"] as const) {
      for (const cooking of ["CONFIRMED", "PREPARING", "READY", "SERVED"] as const) {
        expect(canTransition(held, cooking)).toBe(false);
      }
    }
  });

  it("never sends an order back for approval once it has been approved", () => {
    // Approval precedes payment. Going backwards would let an order that a
    // waiter already vouched for demand a second approval, which is how a
    // guest ends up waiting twice.
    expect(canTransition("AWAITING_ADVANCE_PAYMENT", "NEEDS_APPROVAL")).toBe(false);
  });
});

/**
 * The high-value gates.
 *
 * Pure arithmetic over integer paise, so it is tested without a database. What
 * matters is the boundary: a table sitting exactly ON the threshold must be
 * caught, and a misconfigured percentage must never produce a hold that no
 * payment can clear.
 */
describe("evaluateHold", () => {
  /** The shipped defaults: ₹3,000 threshold and dynamic tiered advance (20% base + 10%/₹1k). */
  const gates = {
    thresholdMinor: 300_000,
    advancePercent: "20",
    approvalRequired: true,
    advanceRequired: true,
  };

  it("lets an ordinary order straight through", () => {
    expect(evaluateHold(80_000, 80_000, gates)).toEqual({
      status: "PENDING",
      advanceMinor: 0,
      isHighValue: false,
    });
  });

  it("holds a high-value order (> ₹3,000) for approval first with tiered advance", () => {
    // ₹5,000 order is > ₹3,000. Extra ₹2,000 over threshold -> 20% + (2 * 10%) = 40% advance = ₹2,000 (200_000 minor)
    expect(evaluateHold(500_000, 500_000, gates)).toEqual({
      status: "NEEDS_APPROVAL",
      advanceMinor: 200_000, // 40% of ₹5,000 = ₹2,000
      isHighValue: true,
    });
  });

  it("computes the tiered advance from the ORDER total", () => {
    // ₹4,000 order: extra ₹1,000 over ₹3,000 -> 20% + 10% = 30% advance of ₹4,000 = ₹1,200 (120_000 minor)
    expect(evaluateHold(900_000, 400_000, gates).advanceMinor).toBe(120_000);
  });

  it("requires advance ONLY when order total strictly exceeds ₹3,000", () => {
    expect(evaluateHold(299_999, 299_999, gates).status).toBe("PENDING");
    expect(evaluateHold(300_000, 300_000, gates).advanceMinor).toBe(0);
    expect(evaluateHold(300_001, 300_001, gates).advanceMinor).toBeGreaterThan(0);
  });

  it("goes straight to the advance when approval is switched off", () => {
    const noApproval = { ...gates, approvalRequired: false };

    // ₹5,000 order -> 40% advance = ₹2,000 (200_000 minor)
    expect(evaluateHold(500_000, 500_000, noApproval)).toEqual({
      status: "AWAITING_ADVANCE_PAYMENT",
      advanceMinor: 200_000,
      isHighValue: true,
    });
  });

  it("holds only for approval when the advance is switched off", () => {
    const noAdvance = { ...gates, advanceRequired: false };

    expect(evaluateHold(500_000, 500_000, noAdvance)).toEqual({
      status: "NEEDS_APPROVAL",
      advanceMinor: 0,
      isHighValue: true,
    });
  });

  it("passes everything through when advance is disabled or threshold is zero", () => {
    const off = { ...gates, advanceRequired: false, thresholdMinor: 0 };

    expect(evaluateHold(50_000_000, 50_000_000, off).status).toBe("PENDING");
  });
});
