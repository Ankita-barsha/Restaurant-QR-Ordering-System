/**
 * File storage.
 *
 * Every consumer talks to the StorageProvider interface, never to `fs`
 * directly. Swapping local disk for S3 or Cloudinary later means writing one
 * new implementation and changing the export at the bottom of this file —
 * no controller or service is touched.
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
 * Renaming `shell.php` to `photo.jpg` defeats extension checks entirely; only
 * inspecting the leading bytes catches it.
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
 *
 * Runs AFTER multer has written the file, because the bytes must exist to be
 * inspected. On failure the caller deletes the file — see removeOnInvalid.
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
 * Local disk storage.
 *
 * Suitable for a single-server deployment. It does NOT survive container
 * restarts on ephemeral filesystems and cannot be shared between instances —
 * the two reasons to move to object storage when you scale out.
 */
class LocalDiskStorage implements StorageProvider {
  public readonly root = path.resolve(process.cwd(), config.upload.directory);

  async init(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  toPublicUrl(filename: string): string {
    return `${config.upload.publicPath}/${filename}`;
  }

  async remove(publicUrl: string | null | undefined): Promise<void> {
    if (!publicUrl?.startsWith(`${config.upload.publicPath}/`)) {
      return;
    }

    // basename strips any directory component, so a crafted value such as
    // "/uploads/../../.env" cannot escape the uploads directory.
    const filename = path.basename(publicUrl);
    const target = path.join(this.root, filename);

    // Defence in depth: confirm the resolved path is genuinely inside root.
    if (!target.startsWith(this.root)) {
      throw AppError.badRequest("Invalid file path");
    }

    await fs.rm(target, { force: true });
  }
}

export const storage: StorageProvider = new LocalDiskStorage();
