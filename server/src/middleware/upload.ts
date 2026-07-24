/**
 * File upload middleware.
 *
 * File upload is the most commonly exploited feature in a web application.
 * The defences here, in order of importance:
 *
 *   1. The stored filename is generated, never taken from the client.
 *      `originalname` may contain "../../../etc/passwd" or a null byte.
 *   2. The extension is whitelisted, not blacklisted. A blacklist always has
 *      a hole (.phtml, .php5, .svg).
 *   3. Size is capped, so an upload cannot fill the disk.
 *   4. Content is verified by magic bytes AFTER writing, because the
 *      client-supplied mimetype is not evidence of anything.
 */

import crypto from "node:crypto";
import path from "node:path";

import type { RequestHandler } from "express";
import multer from "multer";

import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { isRealImage, storage } from "../utils/storage.js";

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const diskStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, storage.root);
  },

  filename: (_req, file, callback) => {
    // The client's filename is used ONLY to read its extension, and even that
    // is whitelisted below. The stored name is random, which also prevents one
    // upload overwriting another.
    const extension = path.extname(file.originalname).toLowerCase();
    const random = crypto.randomBytes(16).toString("hex");

    callback(null, `${random}${extension}`);
  },
});

/**
 * First-pass rejection, before any bytes are written.
 *
 * Cheap checks only — both values come from the client, so passing here
 * proves nothing. The real verification happens in verifyUploadedImage.
 */
const imageFileFilter: multer.Options["fileFilter"] = (_req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    callback(AppError.badRequest(`Unsupported file type: ${extension || "unknown"}`));
    return;
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    callback(AppError.badRequest(`Unsupported content type: ${file.mimetype}`));
    return;
  }

  callback(null, true);
};

const uploader = multer({
  storage: diskStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: config.upload.maxBytes,
    // Rejects multipart bodies carrying more files than expected.
    files: 1,
  },
});

/** Accepts a single optional image under the given field name. */
export const uploadImage = (fieldName = "image"): RequestHandler =>
  uploader.single(fieldName);

/**
 * Confirms the written file really is an image, deleting it if not.
 *
 * Mount immediately after uploadImage. This is the check that actually stops
 * a PHP shell renamed to .jpg, because it reads the file's own bytes rather
 * than trusting anything the client asserted.
 */
export const verifyUploadedImage: RequestHandler = async (req, _res, next) => {
  if (!req.file) {
    next();
    return;
  }

  if (await isRealImage(req.file.path)) {
    next();
    return;
  }

  // Never leave a rejected file on disk.
  await storage.remove(storage.toPublicUrl(req.file.filename));

  throw AppError.badRequest("Uploaded file is not a valid image");
};

export const isMulterError = (error: unknown): error is multer.MulterError =>
  error instanceof multer.MulterError;

/**
 * Translates multer's own errors into AppErrors.
 *
 * Multer throws MulterError, which the central handler would otherwise report
 * as a 500 — an oversized upload is a client mistake, not a server fault.
 * Consumed by errorHandler.ts.
 */
export const multerErrorToAppError = (error: multer.MulterError): AppError => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return AppError.badRequest(
      `File is too large. Maximum size is ${config.upload.maxBytes / 1024 / 1024}MB`
    );
  }

  if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
    return AppError.badRequest("Unexpected file upload");
  }

  return AppError.badRequest(`Upload failed: ${error.message}`);
};
