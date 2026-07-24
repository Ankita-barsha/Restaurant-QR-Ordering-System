/**
 * QR code generation for tables.
 *
 * The code encodes a URL to the CUSTOMER app, not a bare token:
 *
 *   https://app.example.com/t/<qrToken>
 *
 * A phone camera opens a URL directly, with no app to install and nothing to
 * type. A raw token would require the diner to already have an app that knows
 * what to do with it, which defeats the point of ordering by QR.
 *
 * The token in the URL is Table.qrToken, deliberately separate from Table.id,
 * so a printed code can be invalidated by rotating the token without touching
 * the table row or the orders that reference it.
 */

import crypto from "node:crypto";
import path from "node:path";

import QRCode from "qrcode";

import { config } from "../config/env.js";
import { storage } from "./storage.js";

/** Builds the URL a scanned code opens. */
export const buildScanUrl = (qrToken: string): string =>
  `${config.qr.baseUrl}/${config.qr.scanPath}/${qrToken}`;

/**
 * Renders a QR code to a PNG in the upload directory.
 *
 * Options chosen for print, which is where these end up:
 *   errorCorrectionLevel "H" — recovers from ~30% damage, so a code survives
 *     a scuffed or partly covered table sticker.
 *   width 512 — large enough to print sharply on a table tent.
 *   margin 2 — the "quiet zone"; scanners fail without surrounding whitespace.
 *
 * @returns the public URL of the generated image
 */
export const generateQrImage = async (qrToken: string): Promise<string> => {
  const filename = `qr-${crypto.randomBytes(12).toString("hex")}.png`;
  const absolutePath = path.join(storage.root, filename);

  await QRCode.toFile(absolutePath, buildScanUrl(qrToken), {
    errorCorrectionLevel: "H",
    width: 512,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  return storage.toPublicUrl(filename);
};

/**
 * Renders a QR code straight to a PNG buffer.
 *
 * A QR image is fully determined by its token, so it never needs to be stored:
 * regenerating costs a few milliseconds. This matters on hosts with ephemeral
 * filesystems (Render, Railway, Fly free tiers), where a restart would
 * otherwise wipe every table's QR image and break the core feature.
 */
export const renderQrBuffer = async (qrToken: string): Promise<Buffer> => {
  return QRCode.toBuffer(buildScanUrl(qrToken), {
    errorCorrectionLevel: "H",
    width: 512,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
};

/**
 * Creates a fresh, unguessable QR token.
 *
 * 32 hex characters from crypto.randomBytes — not Math.random, and not a
 * sequential value. A guessable token would let anyone place orders against
 * an arbitrary table without ever entering the restaurant.
 */
export const generateQrToken = (): string =>
  crypto.randomBytes(16).toString("hex");
