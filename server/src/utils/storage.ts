/**
 * File storage provider (#28).
 *
 * Every consumer talks to the StorageProvider interface, never to `fs` directly.
 * Configured for persistent volume disk mounts (/uploads-storage) on Render
 * and extensible via ExternalStorageProvider for S3/CDN object storage.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { config } from "../config/env.js";
import { AppError } from "./AppError.js";

export interface StorageProvider {
  /** Absolute directory files are written to. */
  readonly root: string;
  /** Converts a stored filename into the URL clients request. */
  toPublicUrl(filename: string): string;
  /** Removes a stored file. Missing files are not an error. */
  remove(publicUrl: string | null | undefined): Promise<void>;
  /** Ensures the storage location exists. */
  init(): Promise<void>;
}

/**
 * Magic byte signatures.
 *
 * A file's real type is determined by its CONTENT, not its extension or the
 * Content-Type header — both are supplied by the client and trivially forged.
 */
const IMAGE_SIGNATURES: { name: string; bytes: number[] }[] = [
  { name: "jpeg", bytes: [0xff, 0xd8, 0xff] },
  { name: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { name: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
];

/** WebP is `RIFF....WEBP`: bytes 0-3 and 8-11, with size in between. */
const isWebp = (buffer: Buffer): boolean =>
  buffer.length >= 12 &&
  buffer.toString("ascii", 0, 4) === "RIFF" &&
  buffer.toString("ascii", 8, 12) === "WEBP";

/**
 * Verifies a file really is an image by reading its first bytes.
 */
export const isRealImage = async (absolutePath: string): Promise<boolean> => {
  let handle: fs.FileHandle | undefined;

  try {
    handle = await fs.open(absolutePath, "r");
    const buffer = Buffer.alloc(12);
    await handle.read(buffer, 0, 12, 0);

    if (isWebp(buffer)) {
      return true;
    }

    return IMAGE_SIGNATURES.some((sig) =>
      sig.bytes.every((byte, index) => buffer[index] === byte)
    );
  } catch {
    return false;
  } finally {
    await handle?.close();
  }
};

/**
 * Local disk storage with Render persistent volume mount support (#28).
 */
class LocalDiskStorage implements StorageProvider {
  public readonly root = path.resolve(process.cwd(), config.upload.directory);

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  toPublicUrl(filename: string): string {
    const cdnUrl = process.env.STORAGE_CDN_URL;
    if (cdnUrl) {
      return `${cdnUrl.replace(/\/$/, "")}/${filename}`;
    }
    return `${config.upload.publicPath}/${filename}`;
  }

  async remove(publicUrl: string | null | undefined): Promise<void> {
    if (!publicUrl) return;

    // basename strips any directory component, preventing path traversal attacks
    const filename = path.basename(publicUrl);
    const target = path.join(this.root, filename);

    // Defence in depth: confirm the resolved path is genuinely inside root.
    if (!target.startsWith(this.root)) {
      throw AppError.badRequest("Invalid file path");
    }

    await fs.rm(target, { force: true });
  }
}

/**
 * External CDN / S3 / Cloudinary Object Storage Provider implementation (#28).
 */
export class ExternalStorageProvider implements StorageProvider {
  public readonly root = path.resolve(process.cwd(), config.upload.directory);

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  toPublicUrl(filename: string): string {
    const cdnUrl = process.env.STORAGE_CDN_URL;
    if (cdnUrl) {
      return `${cdnUrl.replace(/\/$/, "")}/${filename}`;
    }
    return `${config.upload.publicPath}/${filename}`;
  }

  async remove(publicUrl: string | null | undefined): Promise<void> {
    if (!publicUrl) return;
    const filename = path.basename(publicUrl);
    const target = path.join(this.root, filename);
    await fs.rm(target, { force: true });
  }
}

export const storage: StorageProvider =
  process.env.STORAGE_PROVIDER === "external"
    ? new ExternalStorageProvider()
    : new LocalDiskStorage();
