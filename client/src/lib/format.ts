/**
 * Display formatting.
 *
 * Money arrives from the API as an exact decimal STRING ("349.00"). It is
 * parsed to a number only at the final formatting step, never for arithmetic —
 * that lives in ./money, in integer paise.
 */

import { fromMinor, sumLinesMinor } from "./money";

/** Formats a decimal string as currency. */
export const formatMoney = (value: string | number, currency = "INR"): string => {
  const amount = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Sums decimal strings exactly, in integer paise.
 *
 * Used for the cart subtotal. Adding the floats directly would drift:
 * 0.1 + 0.2 !== 0.3.
 */
export const sumMoney = (values: { price: string; quantity: number }[]): string =>
  fromMinor(sumLinesMinor(values));

/** "2 minutes ago" style relative time, for the kitchen ticket age. */
export const timeAgo = (iso: string): string => {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
};

/** Minutes elapsed since a timestamp — drives the kitchen's urgency colours. */
export const minutesSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 60000);

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

/** Resolves a server-relative image path to an absolute URL. */
export const imageUrl = (path: string | null, apiUrl: string): string | null => {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  if (path.startsWith("/uploads/")) return `${apiUrl}${path}`;
  return path;
};
