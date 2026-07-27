/**
 * The order status state machine.
 *
 * Pure logic, so it is tested without a database. What matters here is what is
 * REFUSED: the UI hides illegal buttons, but the UI is not a guarantee, and a
 * served order that can be reopened is a bill that can be changed after the
 * customer has left.
 */

import { describe, expect, it } from "vitest";

import { canTransition } from "./order.service.js";
import type { OrderStatus } from "../validations/order.validation.js";

const ALL: OrderStatus[] = [
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
});
