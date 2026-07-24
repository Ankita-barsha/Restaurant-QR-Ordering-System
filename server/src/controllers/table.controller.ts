import type { RequestHandler } from "express";

import * as tableService from "../services/table.service.js";
import { buildScanUrl, renderQrBuffer } from "../utils/qrcode.js";
import type {
  CreateTableInput,
  TableListQuery,
  UpdateTableInput,
} from "../validations/table.validation.js";

type IdParams = { id: string };
type TokenParams = { token: string };
type NoParams = Record<string, never>;

/** GET /api/tables */
export const list: RequestHandler = async (req, res) => {
  const query = req.validatedQuery as TableListQuery;

  const { tables, meta } = await tableService.listTables(query);

  res.json({ success: true, data: tables, meta });
};

/** GET /api/tables/:id */
export const getById: RequestHandler<IdParams> = async (req, res) => {
  const table = await tableService.getTableById(req.params.id);

  res.json({
    success: true,
    // The scan URL is derived rather than stored: it depends on QR_BASE_URL,
    // which differs between environments for the same table row.
    data: { ...table, scanUrl: buildScanUrl(table.qrToken) },
  });
};

/**
 * GET /api/tables/scan/:token — PUBLIC.
 * The endpoint a diner's phone reaches after scanning.
 */
export const scan: RequestHandler<TokenParams> = async (req, res) => {
  const table = await tableService.resolveByToken(req.params.token);

  res.json({ success: true, data: { table } });
};

/** POST /api/tables */
export const create: RequestHandler<NoParams, unknown, CreateTableInput> = async (
  req,
  res
) => {
  const table = await tableService.createTable(req.body);

  res.status(201).json({
    success: true,
    message: "Table created",
    data: { ...table, scanUrl: buildScanUrl(table.qrToken) },
  });
};

/** PATCH /api/tables/:id */
export const update: RequestHandler<IdParams, unknown, UpdateTableInput> = async (
  req,
  res
) => {
  const table = await tableService.updateTable(req.params.id, req.body);

  res.json({ success: true, message: "Table updated", data: table });
};

/**
 * GET /api/tables/:id/qr.png — renders the QR on demand.
 *
 * Preferred over the stored image file: it cannot go missing, and it always
 * reflects the table's CURRENT token, so a rotated code can never be served
 * stale from disk.
 */
export const qrImage: RequestHandler<IdParams> = async (req, res) => {
  const table = await tableService.getTableById(req.params.id);

  const png = await renderQrBuffer(table.qrToken);

  res.setHeader("Content-Type", "image/png");
  // Not cached: rotating a token must take effect immediately.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="qr-table-${table.tableNumber}.png"`
  );
  res.send(png);
};

/** POST /api/tables/:id/qr/rotate — invalidates the printed code. */
export const rotateQr: RequestHandler<IdParams> = async (req, res) => {
  const table = await tableService.rotateQrToken(req.params.id);

  res.json({
    success: true,
    message: "QR code rotated. The previous code no longer works.",
    data: { ...table, scanUrl: buildScanUrl(table.qrToken) },
  });
};

/** POST /api/tables/:id/qr/regenerate — same token, new image. */
export const regenerateQr: RequestHandler<IdParams> = async (req, res) => {
  const table = await tableService.regenerateQrImage(req.params.id);

  res.json({
    success: true,
    message: "QR image regenerated",
    data: { ...table, scanUrl: buildScanUrl(table.qrToken) },
  });
};

/** PATCH /api/tables/:id/active */
export const setActive: RequestHandler<
  IdParams,
  unknown,
  { isActive: boolean }
> = async (req, res) => {
  const table = await tableService.setTableActive(
    req.params.id,
    req.body.isActive
  );

  res.json({
    success: true,
    message: req.body.isActive ? "Table is back in service" : "Table deactivated",
    data: table,
  });
};

/** DELETE /api/tables/:id */
export const remove: RequestHandler<IdParams> = async (req, res) => {
  await tableService.deleteTable(req.params.id);

  res.json({ success: true, message: "Table deleted" });
};
