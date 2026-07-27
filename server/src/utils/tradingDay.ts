/**
 * The trading day.
 *
 * A restaurant's "today" is a wall-clock day in the town it trades in. Neither
 * the Node process nor Postgres necessarily runs in that zone — a managed
 * database is almost always UTC — so every report has to state the zone
 * explicitly and use the SAME one.
 *
 * When it did not, the dashboard's "today's revenue" counted from the server's
 * local midnight while the chart grouped rows by `date_trunc('day', ...)` in
 * the database's zone. In IST that is a five-and-a-half-hour disagreement: an
 * order taken at 02:00 counted towards today on one screen and yesterday on
 * the other, and the two totals on the same page did not match.
 */

import { config } from "../config/env.js";

/**
 * Wall-clock parts of an instant in a given zone.
 *
 * Intl is the only timezone database Node ships with, and it handles DST and
 * historic offset changes correctly — which hand-rolled offset arithmetic
 * does not.
 */
const partsIn = (instant: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts: Record<string, number> = {};

  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== "literal") {
      // "24" is how en-CA renders midnight in hour12: false.
      parts[part.type] = part.value === "24" ? 0 : Number(part.value);
    }
  }

  return parts as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
};

/** The zone's offset from UTC, in milliseconds, at a given instant. */
const offsetMs = (instant: Date, timeZone: string): number => {
  const parts = partsIn(instant, timeZone);

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  // Seconds are the finest granularity formatToParts reports, so the source
  // instant is truncated to match before differencing.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * The UTC instant at which the current day began in the reporting zone.
 *
 * Returned as a Date because that is what Prisma filters take; the value is a
 * true instant, not a local-looking one.
 */
export const startOfTradingDay = (
  now: Date = new Date(),
  timeZone: string = config.reporting.timezone
): Date => {
  const parts = partsIn(now, timeZone);

  const midnightAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day);

  // Midnight local is that wall-clock reading minus the zone's offset. The
  // offset is taken AT `now` rather than at midnight, which is correct except
  // within the hour of a DST transition — a window no restaurant reports on.
  return new Date(midnightAsUtc - offsetMs(now, timeZone));
};

/**
 * The trading day an instant belongs to, as "YYYY-MM-DD".
 *
 * Used to label chart buckets. Formatting the raw UTC timestamp instead would
 * relabel late-evening orders as the following day.
 */
export const tradingDayKey = (
  instant: Date,
  timeZone: string = config.reporting.timezone
): string => {
  const { year, month, day } = partsIn(instant, timeZone);

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
