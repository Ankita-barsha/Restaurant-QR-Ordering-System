/**
 * The trading day.
 *
 * These tests pin down the boundary that the dashboard and the sales chart
 * disagreed on: an order taken late in the evening IST falls on the same day
 * under both, and an order taken just after local midnight does not count
 * towards the previous day just because it is still yesterday in UTC.
 */

import { describe, expect, it } from "vitest";

import { startOfTradingDay, tradingDayKey } from "./tradingDay.js";

const IST = "Asia/Kolkata"; // UTC+05:30, no DST
const UTC = "UTC";
const NEW_YORK = "America/New_York"; // UTC-05:00 / -04:00, observes DST

describe("startOfTradingDay", () => {
  it("returns the instant local midnight occurred, not UTC midnight", () => {
    // 27 July 2026, 09:00 UTC = 14:30 IST. The day began at 18:30 UTC on the
    // 26th, which is 00:00 on the 27th in Kolkata.
    const start = startOfTradingDay(new Date("2026-07-27T09:00:00Z"), IST);

    expect(start.toISOString()).toBe("2026-07-26T18:30:00.000Z");
  });

  it("keeps an order placed just after local midnight in the NEW day", () => {
    // 00:30 IST on the 27th is 19:00 UTC on the 26th. Under a UTC boundary
    // this order would be counted towards the 26th — the exact five-and-a-half
    // hour window in which the dashboard and the chart used to disagree.
    const justAfterMidnight = new Date("2026-07-26T19:00:00Z");

    expect(startOfTradingDay(justAfterMidnight, IST).toISOString()).toBe(
      "2026-07-26T18:30:00.000Z"
    );
    expect(tradingDayKey(justAfterMidnight, IST)).toBe("2026-07-27");
  });

  it("keeps a late dinner service in the day it was served", () => {
    // 23:45 IST on the 27th is 18:15 UTC the same day.
    const lateService = new Date("2026-07-27T18:15:00Z");

    expect(tradingDayKey(lateService, IST)).toBe("2026-07-27");
    expect(startOfTradingDay(lateService, IST).toISOString()).toBe(
      "2026-07-26T18:30:00.000Z"
    );
  });

  it("agrees with UTC midnight when the reporting zone IS UTC", () => {
    const start = startOfTradingDay(new Date("2026-07-27T09:00:00Z"), UTC);

    expect(start.toISOString()).toBe("2026-07-27T00:00:00.000Z");
  });

  it("follows daylight saving in zones that observe it", () => {
    // 1 July: New York is on EDT, UTC-4, so midnight local is 04:00 UTC.
    expect(
      startOfTradingDay(new Date("2026-07-01T16:00:00Z"), NEW_YORK).toISOString()
    ).toBe("2026-07-01T04:00:00.000Z");

    // 1 January: EST, UTC-5, so midnight local is 05:00 UTC. A fixed offset
    // would be an hour out for half the year.
    expect(
      startOfTradingDay(new Date("2026-01-01T16:00:00Z"), NEW_YORK).toISOString()
    ).toBe("2026-01-01T05:00:00.000Z");
  });

  it("is never in the future and never more than a day back", () => {
    const now = new Date("2026-07-27T09:00:00Z");

    for (const zone of [IST, UTC, NEW_YORK, "Australia/Sydney", "Pacific/Kiritimati"]) {
      const start = startOfTradingDay(now, zone);

      expect(start.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime() - start.getTime()).toBeLessThan(24 * 3_600_000);
    }
  });
});

describe("tradingDayKey", () => {
  it("labels an instant with the local date, zero-padded", () => {
    expect(tradingDayKey(new Date("2026-01-05T06:00:00Z"), IST)).toBe("2026-01-05");
    expect(tradingDayKey(new Date("2026-12-31T20:00:00Z"), IST)).toBe("2027-01-01");
  });

  it("labels the same instant differently either side of the date line", () => {
    const instant = new Date("2026-07-27T02:00:00Z");

    expect(tradingDayKey(instant, "Pacific/Kiritimati")).toBe("2026-07-27");
    expect(tradingDayKey(instant, "America/Los_Angeles")).toBe("2026-07-26");
  });

  it("labels the start of the trading day as that day", () => {
    // The round trip that keeps the dashboard's date honest: whatever instant
    // the day began at, formatting it must name the day it began.
    const now = new Date("2026-07-27T09:00:00Z");

    for (const zone of [IST, UTC, NEW_YORK]) {
      expect(tradingDayKey(startOfTradingDay(now, zone), zone)).toBe(
        tradingDayKey(now, zone)
      );
    }
  });
});
