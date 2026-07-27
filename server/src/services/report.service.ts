/**
 * Reports and analytics.
 *
 * Aggregation runs in the DATABASE, not in JavaScript. Fetching every order
 * and reducing it in Node works against seed data and falls over at scale:
 * it pulls the whole table across the wire and holds it in memory.
 *
 * Cancelled orders are excluded from revenue everywhere. Including them would
 * report money that was never taken.
 *
 * Every date boundary in this file comes from config.reporting.timezone, via
 * startOfTradingDay and the AT TIME ZONE clause in the raw queries. Nothing
 * here may use server-local time or the database's default zone: the two
 * disagree, and figures on the same screen must not.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { config } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { fromMinorUnits, toMinorUnits } from "../utils/money.js";
import { startOfTradingDay, tradingDayKey } from "../utils/tradingDay.js";

/** Orders that represent real revenue. */
const REVENUE_STATUSES: Prisma.EnumOrderStatusFilter = {
  notIn: ["CANCELLED"],
};

const dateRange = (from?: Date, to?: Date): Prisma.DateTimeFilter | undefined => {
  if (!from && !to) {
    return undefined;
  }

  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
};

/**
 * Dashboard summary: today's trading plus live operational counts.
 *
 * "Today" is the trading day in the reporting timezone — the same boundary the
 * sales chart buckets on, so the headline figure and the last bar of the chart
 * always describe the same set of orders.
 */
export const getDashboardSummary = async () => {
  const todayStart = startOfTradingDay();

  const [
    todayAggregate,
    todayCount,
    openOrders,
    pendingCount,
    preparingCount,
    readyCount,
    totalTables,
    occupiedTables,
    menuItems,
    soldOutItems,
    customerCount,
  ] = await prisma.$transaction([
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { placedAt: { gte: todayStart }, status: REVENUE_STATUSES },
    }),
    prisma.order.count({
      where: { placedAt: { gte: todayStart }, status: REVENUE_STATUSES },
    }),
    prisma.order.count({
      where: { status: { notIn: ["SERVED", "CANCELLED"] } },
    }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: "PREPARING" } }),
    prisma.order.count({ where: { status: "READY" } }),
    prisma.table.count({ where: { isActive: true } }),
    prisma.table.count({ where: { status: "OCCUPIED" } }),
    prisma.food.count({ where: { deletedAt: null } }),
    prisma.food.count({ where: { deletedAt: null, isAvailable: false } }),
    prisma.customer.count(),
  ]);

  const todayRevenueMinor = todayAggregate._sum.totalAmount
    ? toMinorUnits(todayAggregate._sum.totalAmount.toString())
    : 0;

  return {
    today: {
      // Which day these figures cover, and under whose clock. Stated rather
      // than left implicit, so a manager reading the dashboard from another
      // timezone knows what "today" means here.
      date: tradingDayKey(todayStart),
      timezone: config.reporting.timezone,
      revenue: fromMinorUnits(todayRevenueMinor),
      orders: todayCount,
      // Integer division keeps the average exact to the paisa.
      averageOrderValue: fromMinorUnits(
        todayCount > 0 ? Math.round(todayRevenueMinor / todayCount) : 0
      ),
    },
    live: {
      openOrders,
      pending: pendingCount,
      preparing: preparingCount,
      ready: readyCount,
    },
    tables: { total: totalTables, occupied: occupiedTables, free: totalTables - occupiedTables },
    menu: { total: menuItems, soldOut: soldOutItems },
    customers: customerCount,
  };
};

/** Revenue and order counts per day, for the dashboard chart. */
export const getSalesReport = async (from?: Date, to?: Date) => {
  const range = dateRange(from, to);
  const zone = config.reporting.timezone;

  /**
   * Raw SQL because Prisma's groupBy cannot group a DateTime by day; doing it
   * in JavaScript would mean loading every order in the range.
   *
   * placedAt is `timestamp` (no zone) holding UTC, so it is labelled UTC and
   * then converted to the reporting zone before truncating. Truncating the
   * stored value directly would split days at UTC midnight — 05:30 local in
   * India — putting a late dinner service in the wrong day and disagreeing
   * with the dashboard's "today".
   *
   * The bucket comes back as TEXT. Returned as a timestamp it would be a
   * zone-less local reading that the driver re-labels UTC, undoing the
   * conversion on the way out.
   */
  const rows = await prisma.$queryRaw<
    { day: string; orders: bigint; revenue: string | null }[]
  >`
    SELECT
      to_char(
        date_trunc('day', "placedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${zone}),
        'YYYY-MM-DD'
      )                             AS day,
      COUNT(*)                      AS orders,
      SUM("totalAmount")            AS revenue
    FROM orders
    WHERE status <> 'CANCELLED'
      AND ("placedAt" >= ${from ?? new Date(0)})
      AND ("placedAt" <= ${to ?? new Date(8.64e15)})
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const totalAggregate = await prisma.order.aggregate({
    _sum: { totalAmount: true },
    _count: true,
    where: { status: REVENUE_STATUSES, ...(range ? { placedAt: range } : {}) },
  });

  return {
    days: rows.map((row) => ({
      date: row.day,
      orders: Number(row.orders),
      revenue: row.revenue ?? "0.00",
    })),
    totals: {
      orders: totalAggregate._count,
      revenue: totalAggregate._sum.totalAmount?.toString() ?? "0.00",
    },
  };
};

/** Best-selling menu items by quantity sold. */
export const getTopSellingItems = async (from?: Date, to?: Date, limit = 10) => {
  const rows = await prisma.$queryRaw<
    { foodId: string; foodName: string; quantity: bigint; revenue: string }[]
  >`
    SELECT
      oi."foodId"        AS "foodId",
      oi."foodName"      AS "foodName",
      SUM(oi.quantity)   AS quantity,
      SUM(oi."lineTotal") AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE o.status <> 'CANCELLED'
      AND o."placedAt" >= ${from ?? new Date(0)}
      AND o."placedAt" <= ${to ?? new Date(8.64e15)}
    GROUP BY oi."foodId", oi."foodName"
    ORDER BY quantity DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    foodId: row.foodId,
    // Read from the order-item snapshot, so a renamed dish still reports
    // under the name it was sold as.
    foodName: row.foodName,
    quantitySold: Number(row.quantity),
    revenue: row.revenue,
  }));
};

/** Order counts broken down by status, for the operations view. */
export const getOrderStatusBreakdown = async (from?: Date, to?: Date) => {
  const range = dateRange(from, to);

  const grouped = await prisma.order.groupBy({
    by: ["status"],
    _count: { _all: true },
    where: range ? { placedAt: range } : undefined,
  });

  return grouped.map((entry) => ({
    status: entry.status,
    count: entry._count._all,
  }));
};

/** Highest-spending customers. */
export const getTopCustomers = async (limit = 10) => {
  const rows = await prisma.$queryRaw<
    { id: string; name: string | null; phone: string | null; orders: bigint; spent: string }[]
  >`
    SELECT
      c.id, c.name, c.phone,
      COUNT(o.id)          AS orders,
      SUM(o."totalAmount") AS spent
    FROM customers c
    JOIN orders o ON o."customerId" = c.id
    WHERE o.status <> 'CANCELLED'
    GROUP BY c.id, c.name, c.phone
    ORDER BY spent DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    orderCount: Number(row.orders),
    totalSpent: row.spent,
  }));
};

/** Report periods the manager can view. */
export type RevenuePeriod = "daily" | "weekly" | "monthly" | "yearly";

/** Maps a period to the Postgres bucket and how far back to look. */
const PERIOD_CONFIG: Record<
  RevenuePeriod,
  { truncTo: string; sinceDays: number; label: string }
> = {
  daily: { truncTo: "day", sinceDays: 30, label: "Last 30 days" },
  weekly: { truncTo: "week", sinceDays: 84, label: "Last 12 weeks" },
  monthly: { truncTo: "month", sinceDays: 365, label: "Last 12 months" },
  yearly: { truncTo: "year", sinceDays: 365 * 5, label: "Last 5 years" },
};

/**
 * Revenue and order counts bucketed by period, plus a payment-method split
 * and headline totals — everything the manager's reports screen needs.
 *
 * The bucket size (day/week/month/year) is validated against a fixed map, so
 * the value can be safely interpolated into date_trunc; it never comes from
 * the user verbatim.
 */
export const getRevenueBreakdown = async (period: RevenuePeriod) => {
  const periodConfig = PERIOD_CONFIG[period];
  const zone = config.reporting.timezone;

  // Counted back from the START of today's trading, not from the current
  // moment, so "last 30 days" is thirty whole days rather than 29 days and
  // however many hours have elapsed since opening.
  const since = new Date(
    startOfTradingDay().getTime() - periodConfig.sinceDays * 86_400_000
  );

  /**
   * Bucketed in the reporting zone, exactly as getSalesReport is — a week or a
   * month has to begin at local midnight, or the first and last day of every
   * bucket leak into its neighbour.
   *
   * The bucket size is looked up from PERIOD_CONFIG and never taken from the
   * request, which is what makes interpolating it into date_trunc safe. The
   * zone and the cutoff are still bound as parameters.
   */
  const buckets = await prisma.$queryRawUnsafe<
    { bucket: string; orders: bigint; revenue: string | null }[]
  >(
    `SELECT
       to_char(
         date_trunc('${periodConfig.truncTo}', "placedAt" AT TIME ZONE 'UTC' AT TIME ZONE $2),
         'YYYY-MM-DD"T"HH24:MI:SS'
       )                                            AS bucket,
       COUNT(*)                                     AS orders,
       SUM("totalAmount")                           AS revenue
     FROM orders
     WHERE status <> 'CANCELLED' AND "placedAt" >= $1
     GROUP BY 1
     ORDER BY 1 DESC`,
    since,
    zone
  );

  // Cash versus online (and card/UPI) — the manager reconciles the till
  // against this. Only PAID orders count as money actually collected.
  const byMethod = await prisma.order.groupBy({
    by: ["paymentMethod"],
    _sum: { totalAmount: true },
    _count: { _all: true },
    where: { paymentStatus: "PAID", placedAt: { gte: since } },
  });

  const totals = await prisma.order.aggregate({
    _sum: { totalAmount: true },
    _count: true,
    where: { status: REVENUE_STATUSES, placedAt: { gte: since } },
  });

  const collected = await prisma.order.aggregate({
    _sum: { totalAmount: true },
    where: { paymentStatus: "PAID", placedAt: { gte: since } },
  });

  const outstanding = await prisma.order.aggregate({
    _sum: { totalAmount: true },
    _count: true,
    where: { paymentStatus: "UNPAID", status: REVENUE_STATUSES, placedAt: { gte: since } },
  });

  return {
    period,
    label: periodConfig.label,
    buckets: buckets.map((row) => ({
      // Deliberately WITHOUT a "Z": this is a wall-clock reading in the
      // restaurant's zone, and the label the manager reads must say the day
      // the restaurant traded, not the day their browser's zone maps it to.
      date: row.bucket,
      orders: Number(row.orders),
      revenue: row.revenue ?? "0.00",
    })),
    payments: byMethod.map((row) => ({
      method: row.paymentMethod ?? "UNRECORDED",
      total: row._sum.totalAmount?.toString() ?? "0.00",
      count: row._count._all,
    })),
    totals: {
      orders: totals._count,
      revenue: totals._sum.totalAmount?.toString() ?? "0.00",
      collected: collected._sum.totalAmount?.toString() ?? "0.00",
      outstanding: outstanding._sum.totalAmount?.toString() ?? "0.00",
      outstandingCount: outstanding._count,
    },
  };
};
