/**
 * Spreadsheet exports.
 *
 * The order book, as a real .xlsx workbook rather than a CSV. That choice is
 * not cosmetic: a CSV mangles a phone number into scientific notation, loses
 * the difference between a date and a string, and cannot carry three related
 * sheets in one file. This is a document an accountant opens.
 *
 * Three sheets, because there are three questions being asked of the same data
 * and each needs a different grain:
 *
 *   Orders           — one row per order, in the sequence they were placed.
 *   Order Items      — one row per DISH, which is where plate counts live.
 *   Customer Summary — one row per diner, with what they ordered and how often.
 *
 * Everything is read from the database at export time. Nothing here recomputes
 * a price: the figures are the snapshots the order was actually billed on, so
 * a menu change years later cannot rewrite last year's book.
 */

import ExcelJS from "exceljs";

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";

/**
 * The most orders a single download may cover.
 *
 * The workbook is assembled in memory before it is sent, so an unbounded range
 * on a busy year is a way to run the API out of heap. Refusing with a message
 * that names the number is better than an OOM the manager reads as "the export
 * is broken": they narrow the dates and it works.
 */
const MAX_EXPORT_ORDERS = 10_000;

export interface OrderExportFilters {
  from?: Date;
  to?: Date;
  status?: string;
  paidOnly?: boolean;
}

/**
 * Money, for a spreadsheet cell.
 *
 * Written as a number so Excel can total a column — a manager WILL select the
 * total column and expect a sum at the bottom. The authoritative values remain
 * the Decimal columns in Postgres; this is a presentation copy, and nothing is
 * ever computed from it.
 */
const money = (value: Prisma.Decimal | null | undefined): number =>
  value == null ? 0 : Number(value.toString());

/** e.g. "Chicken Biryani x2; Garlic Naan x1" */
const describeItems = (items: { foodName: string; quantity: number }[]): string =>
  items.map((item) => `${item.foodName} x${item.quantity}`).join("; ");

const totalPlates = (items: { quantity: number }[]): number =>
  items.reduce((sum, item) => sum + item.quantity, 0);

/**
 * The payment that settled an order.
 *
 * An order can carry several payment rows — a failed online attempt followed
 * by a successful one, or a refund — so the successful row is what the ledger
 * columns describe. Falling back to the most recent attempt means a failed
 * payment still exports its transaction reference, which is exactly what
 * someone chasing a missing payment needs to see.
 */
type PaymentRow = {
  method: string;
  status: string;
  provider: string;
  providerRef: string | null;
  receiptNumber: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

const settlingPayment = (payments: PaymentRow[]): PaymentRow | undefined =>
  payments.find((payment) => payment.status === "SUCCESS") ?? payments[0];

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F2937" },
};

const MONEY_FORMAT = "#,##0.00";
const DATE_FORMAT = "dd-mmm-yyyy hh:mm";

/**
 * Applies the house look to a sheet's header row.
 *
 * Frozen and filtered, because every one of these sheets is longer than a
 * screen and the first thing anyone does is scroll or filter.
 */
const dressSheet = (sheet: ExcelJS.Worksheet): void => {
  const header = sheet.getRow(1);

  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: "middle" };
  header.height = 22;

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const buildWhere = (filters: OrderExportFilters): Prisma.OrderWhereInput => ({
  ...(filters.status ? { status: filters.status as Prisma.EnumOrderStatusFilter["equals"] } : {}),
  ...(filters.paidOnly ? { paymentStatus: "PAID" as const } : {}),
  ...(filters.from || filters.to
    ? {
        placedAt: {
          ...(filters.from ? { gte: filters.from } : {}),
          ...(filters.to ? { lte: filters.to } : {}),
        },
      }
    : {}),
});

const loadOrders = async (filters: OrderExportFilters) => {
  const where = buildWhere(filters);

  const total = await prisma.order.count({ where });

  if (total > MAX_EXPORT_ORDERS) {
    throw AppError.badRequest(
      `That range covers ${total.toLocaleString("en-IN")} orders, more than the ` +
        `${MAX_EXPORT_ORDERS.toLocaleString("en-IN")} a single download can hold. ` +
        "Narrow the date range and export again."
    );
  }

  return prisma.order.findMany({
    where,
    // Ascending: the export reads as a register, oldest first, the way a paper
    // order book is kept. The on-screen list is newest-first because that is
    // what a manager needs live; a printed book is not read backwards.
    orderBy: { placedAt: "asc" },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      table: { select: { tableNumber: true } },
      customer: { select: { name: true, phone: true, email: true } },
      handledBy: { select: { fullName: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
};

type ExportedOrder = Awaited<ReturnType<typeof loadOrders>>[number];

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

const addOrdersSheet = (book: ExcelJS.Workbook, orders: ExportedOrder[]): void => {
  const sheet = book.addWorksheet("Orders");

  sheet.columns = [
    { header: "S.No", key: "serial", width: 7 },
    { header: "Order No", key: "orderNumber", width: 14 },
    { header: "Date & Time", key: "placedAt", width: 20, style: { numFmt: DATE_FORMAT } },
    { header: "Customer Name", key: "name", width: 22 },
    // Text format, so a leading + or a leading zero survives and Excel does
    // not render a ten-digit number in scientific notation.
    { header: "Phone", key: "phone", width: 16, style: { numFmt: "@" } },
    { header: "Table", key: "table", width: 8 },
    { header: "Type", key: "type", width: 11 },
    { header: "Items Ordered", key: "items", width: 46 },
    { header: "Total Plates", key: "plates", width: 12 },
    { header: "Distinct Dishes", key: "dishes", width: 14 },
    { header: "Subtotal", key: "subtotal", width: 12, style: { numFmt: MONEY_FORMAT } },
    { header: "Tax & Service", key: "tax", width: 13, style: { numFmt: MONEY_FORMAT } },
    { header: "Discount", key: "discount", width: 11, style: { numFmt: MONEY_FORMAT } },
    { header: "Total Amount", key: "total", width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: "Order Status", key: "status", width: 13 },
    { header: "Payment Status", key: "paymentStatus", width: 15 },
    { header: "Payment Mode", key: "paymentMode", width: 14 },
    { header: "Gateway", key: "provider", width: 12 },
    { header: "Transaction ID", key: "transactionId", width: 30 },
    { header: "Receipt No", key: "receipt", width: 18 },
    { header: "Paid At", key: "paidAt", width: 20, style: { numFmt: DATE_FORMAT } },
    { header: "Served By", key: "servedBy", width: 18 },
    { header: "Order Notes", key: "notes", width: 30 },
  ];

  orders.forEach((order, index) => {
    const payment = settlingPayment(order.payments);

    sheet.addRow({
      serial: index + 1,
      orderNumber: order.orderNumber,
      placedAt: order.placedAt,
      name: order.customer?.name ?? "",
      phone: order.customer?.phone ?? "",
      table: order.table?.tableNumber ?? "—",
      type: order.type,
      items: describeItems(order.items),
      plates: totalPlates(order.items),
      dishes: order.items.length,
      subtotal: money(order.subtotal),
      tax: money(order.taxAmount),
      discount: money(order.discountAmount),
      total: money(order.totalAmount),
      status: order.status,
      paymentStatus: order.paymentStatus,
      // The settled payment's method is the truth; the order column is only a
      // summary of it and can be blank on an order paid through the gateway.
      paymentMode: payment?.method ?? order.paymentMethod ?? "—",
      provider: payment?.provider ?? "—",
      // Only online money has a provider reference. Saying so is clearer than
      // an empty cell the reader has to interpret.
      transactionId: payment?.providerRef ?? (payment ? "— (cash)" : "—"),
      receipt: payment?.receiptNumber ?? "—",
      paidAt: payment?.paidAt ?? null,
      servedBy: order.handledBy?.fullName ?? "—",
      notes: order.notes ?? "",
    });
  });

  dressSheet(sheet);
};

/**
 * One row per dish on per order — the plate-count sheet.
 *
 * The Orders sheet answers "what did this table spend"; this one answers "how
 * many biryanis did we sell in March", which is a pivot table away once the
 * data is one dish per row.
 */
const addItemsSheet = (book: ExcelJS.Workbook, orders: ExportedOrder[]): void => {
  const sheet = book.addWorksheet("Order Items");

  sheet.columns = [
    { header: "Order No", key: "orderNumber", width: 14 },
    { header: "Date & Time", key: "placedAt", width: 20, style: { numFmt: DATE_FORMAT } },
    { header: "Customer Name", key: "name", width: 22 },
    { header: "Phone", key: "phone", width: 16, style: { numFmt: "@" } },
    { header: "Table", key: "table", width: 8 },
    { header: "Dish", key: "dish", width: 30 },
    { header: "Plates", key: "quantity", width: 9 },
    { header: "Unit Price", key: "unitPrice", width: 12, style: { numFmt: MONEY_FORMAT } },
    { header: "Line Total", key: "lineTotal", width: 12, style: { numFmt: MONEY_FORMAT } },
    { header: "Item Note", key: "notes", width: 26 },
    { header: "Order Status", key: "status", width: 13 },
    { header: "Payment Mode", key: "paymentMode", width: 14 },
    { header: "Transaction ID", key: "transactionId", width: 30 },
  ];

  for (const order of orders) {
    const payment = settlingPayment(order.payments);

    for (const item of order.items) {
      sheet.addRow({
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        name: order.customer?.name ?? "",
        phone: order.customer?.phone ?? "",
        table: order.table?.tableNumber ?? "—",
        dish: item.foodName,
        quantity: item.quantity,
        unitPrice: money(item.unitPrice),
        lineTotal: money(item.lineTotal),
        notes: item.notes ?? "",
        status: order.status,
        paymentMode: payment?.method ?? order.paymentMethod ?? "—",
        transactionId: payment?.providerRef ?? "—",
      });
    }
  }

  dressSheet(sheet);
};

/**
 * One row per diner.
 *
 * Grouped on phone number rather than on the Customer row id: the phone is the
 * unique key a returning guest is matched on, and grouping on it means a guest
 * whose record was edited between visits still reads as one person.
 *
 * Cancelled orders are counted separately rather than dropped. A guest who
 * books and cancels repeatedly is information the restaurant wants, and
 * silently omitting those rows would make the totals here disagree with the
 * Orders sheet for no visible reason.
 */
const addCustomerSheet = (book: ExcelJS.Workbook, orders: ExportedOrder[]): void => {
  const sheet = book.addWorksheet("Customer Summary");

  interface Summary {
    name: string;
    phone: string;
    orders: number;
    cancelled: number;
    plates: number;
    /** dish name -> plates, for the breakdown column. */
    dishes: Map<string, number>;
    spent: number;
    paid: number;
    firstOrder: Date;
    lastOrder: Date;
  }

  const byPhone = new Map<string, Summary>();

  for (const order of orders) {
    const phone = order.customer?.phone ?? "unknown";
    const existing = byPhone.get(phone);

    const summary: Summary = existing ?? {
      name: order.customer?.name ?? "Guest",
      phone: order.customer?.phone ?? "—",
      orders: 0,
      cancelled: 0,
      plates: 0,
      dishes: new Map(),
      spent: 0,
      paid: 0,
      firstOrder: order.placedAt,
      lastOrder: order.placedAt,
    };

    summary.orders += 1;

    if (order.status === "CANCELLED") {
      summary.cancelled += 1;
    } else {
      summary.plates += totalPlates(order.items);
      summary.spent += money(order.totalAmount);

      if (order.paymentStatus === "PAID") {
        summary.paid += money(order.totalAmount);
      }

      for (const item of order.items) {
        summary.dishes.set(
          item.foodName,
          (summary.dishes.get(item.foodName) ?? 0) + item.quantity
        );
      }
    }

    // Orders arrive ascending, so the last one seen is the most recent. The
    // name is refreshed too: if a guest corrected their spelling on a later
    // visit, that is the one worth keeping.
    summary.lastOrder = order.placedAt;
    summary.name = order.customer?.name ?? summary.name;

    byPhone.set(phone, summary);
  }

  sheet.columns = [
    { header: "Customer Name", key: "name", width: 24 },
    { header: "Phone", key: "phone", width: 16, style: { numFmt: "@" } },
    { header: "Orders", key: "orders", width: 9 },
    { header: "Cancelled", key: "cancelled", width: 11 },
    { header: "Total Plates", key: "plates", width: 12 },
    { header: "Distinct Dishes", key: "distinct", width: 14 },
    { header: "Dish Breakdown", key: "breakdown", width: 60 },
    { header: "Total Billed", key: "spent", width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: "Total Paid", key: "paid", width: 14, style: { numFmt: MONEY_FORMAT } },
    { header: "First Order", key: "first", width: 20, style: { numFmt: DATE_FORMAT } },
    { header: "Last Order", key: "last", width: 20, style: { numFmt: DATE_FORMAT } },
  ];

  // Best customers first — the ranking anyone opening this sheet is after.
  const summaries = [...byPhone.values()].sort((a, b) => b.spent - a.spent);

  for (const summary of summaries) {
    const breakdown = [...summary.dishes.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([dish, count]) => `${dish} x${count}`)
      .join("; ");

    sheet.addRow({
      name: summary.name,
      phone: summary.phone,
      orders: summary.orders,
      cancelled: summary.cancelled,
      plates: summary.plates,
      distinct: summary.dishes.size,
      breakdown,
      spent: summary.spent,
      paid: summary.paid,
      first: summary.firstOrder,
      last: summary.lastOrder,
    });
  }

  dressSheet(sheet);
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface OrderExport {
  filename: string;
  buffer: Buffer;
  /** How many orders the file covers, for the audit entry. */
  orderCount: number;
}

/**
 * Builds the order-book workbook.
 *
 * Returns a buffer rather than streaming to the response: the controller owns
 * the HTTP concern, and a service that writes to a response object cannot be
 * called from a scheduled job or a test.
 */
export const buildOrderExport = async (
  filters: OrderExportFilters
): Promise<OrderExport> => {
  const orders = await loadOrders(filters);

  const settings = await prisma.restaurantSettings.findUnique({
    where: { id: "singleton" },
    select: { name: true, currency: true },
  });

  const book = new ExcelJS.Workbook();

  book.creator = settings?.name ?? "Restaurant";
  book.created = new Date();

  addOrdersSheet(book, orders);
  addItemsSheet(book, orders);
  addCustomerSheet(book, orders);

  const stamp = new Date().toISOString().slice(0, 10);

  return {
    // Non-ASCII and spaces are stripped: the name travels in a
    // Content-Disposition header, where they need escaping browsers disagree on.
    filename: `orders-${(settings?.name ?? "restaurant")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${stamp}.xlsx`,
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
    orderCount: orders.length,
  };
};
