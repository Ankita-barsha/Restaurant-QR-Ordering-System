/**
 * Table and QR code business logic.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import { buildScanUrl, generateQrImage, generateQrToken } from "../utils/qrcode.js";
import { storage } from "../utils/storage.js";
import type {
  CreateTableInput,
  TableListQuery,
  UpdateTableInput,
} from "../validations/table.validation.js";

export const listTables = async (
  query: TableListQuery
): Promise<{ tables: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.TableWhereInput = {
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? { tableNumber: { contains: query.search, mode: "insensitive" } }
      : {}),
  };

  const [tables, total] = await prisma.$transaction([
    prisma.table.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { tableNumber: "asc" },
    }),
    prisma.table.count({ where }),
  ]);

  return { tables, meta: buildPaginationMeta(pagination, total) };
};

export const getTableById = async (id: string) => {
  const table = await prisma.table.findUnique({ where: { id } });

  if (!table) {
    throw AppError.notFound("Table not found");
  }

  return table;
};

/**
 * Resolves a scanned QR token to the table a diner is sitting at.
 *
 * PUBLIC — reached by anyone with a phone camera, so it returns only what the
 * ordering screen needs. It deliberately does NOT echo the token back, and
 * never exposes staff or order data.
 */
export const resolveByToken = async (token: string) => {
  const table = await prisma.table.findUnique({
    where: { qrToken: token },
    select: {
      id: true,
      tableNumber: true,
      capacity: true,
      status: true,
      isActive: true,
    },
  });

  // A rotated or fabricated token is reported as "not found" rather than
  // "invalid", so scanning cannot be used to probe which tokens once existed.
  if (!table) {
    throw AppError.notFound("This QR code is no longer valid");
  }

  if (!table.isActive || table.status === "INACTIVE") {
    throw AppError.notFound("This table is not currently in service");
  }

  const { isActive: _isActive, ...publicFields } = table;

  return publicFields;
};

/** Creates a table and renders its QR code in one step. */
export const createTable = async (input: CreateTableInput) => {
  const existing = await prisma.table.findUnique({
    where: { tableNumber: input.tableNumber },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict(`Table "${input.tableNumber}" already exists`);
  }

  const qrToken = generateQrToken();

  // The image is rendered before the row is created, so a table never exists
  // in a state where its QR code is missing.
  const qrImageUrl = await generateQrImage(qrToken);

  return prisma.table.create({
    data: {
      tableNumber: input.tableNumber,
      capacity: input.capacity ?? 4,
      status: input.status ?? "AVAILABLE",
      isActive: input.isActive ?? true,
      qrToken,
      qrImageUrl,
    },
  });
};

export const updateTable = async (id: string, input: UpdateTableInput) => {
  await getTableById(id);

  if (input.tableNumber) {
    const clash = await prisma.table.findFirst({
      where: { tableNumber: input.tableNumber, id: { not: id } },
      select: { id: true },
    });

    if (clash) {
      throw AppError.conflict(`Table "${input.tableNumber}" already exists`);
    }
  }

  return prisma.table.update({ where: { id }, data: input });
};

/**
 * Issues a NEW token and QR image, permanently invalidating the printed code.
 *
 * This is the response to a leaked or photographed QR code: someone who
 * captured the old URL can no longer order against the table. It is also why
 * qrToken is a separate column from id — rotating an id would break every
 * order that references the table.
 */
export const rotateQrToken = async (id: string) => {
  const table = await getTableById(id);

  const qrToken = generateQrToken();
  const qrImageUrl = await generateQrImage(qrToken);

  const updated = await prisma.table.update({
    where: { id },
    data: { qrToken, qrImageUrl },
  });

  // Removed only after the new image is committed, so a failure cannot leave
  // the table with no code at all.
  await storage.remove(table.qrImageUrl);

  return updated;
};

/** Re-renders the image for the EXISTING token, e.g. after a failed print. */
export const regenerateQrImage = async (id: string) => {
  const table = await getTableById(id);

  const qrImageUrl = await generateQrImage(table.qrToken);

  const updated = await prisma.table.update({
    where: { id },
    data: { qrImageUrl },
  });

  await storage.remove(table.qrImageUrl);

  return updated;
};

/** The URL encoded in this table's QR code, for admin display and printing. */
export const getScanUrl = async (id: string): Promise<string> => {
  const table = await getTableById(id);

  return buildScanUrl(table.qrToken);
};

/**
 * Deletes a table, or refuses when orders reference it.
 *
 * Order.tableId is onDelete: SetNull, so a hard delete would silently detach
 * historical orders from their table and corrupt reporting. Tables with order
 * history must be DEACTIVATED instead, which keeps the record intact while
 * removing it from service.
 */
export const deleteTable = async (id: string): Promise<void> => {
  const table = await getTableById(id);

  const orderCount = await prisma.order.count({ where: { tableId: id } });

  if (orderCount > 0) {
    throw AppError.conflict(
      `Cannot delete: ${orderCount} order(s) reference this table. Deactivate it instead.`
    );
  }

  await prisma.table.delete({ where: { id } });

  await storage.remove(table.qrImageUrl);
};

/** Removes a table from service without deleting it. */
export const setTableActive = async (id: string, isActive: boolean) => {
  await getTableById(id);

  return prisma.table.update({
    where: { id },
    data: {
      isActive,
      // Keeps status consistent with the flag, so the floor view and the
      // active flag cannot disagree.
      status: isActive ? "AVAILABLE" : "INACTIVE",
    },
  });
};
