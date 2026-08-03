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

// A value import, not `import type`: Prisma.sql builds the shared status
// filter used by the raw-SQL reports below.
import { Prisma } from "../generated/prisma/client.js";
import { config } from "../config/env.js";
import { prisma } from "../config/prisma.js";
import { fromMinorUnits, toMinorUnits } from "../utils/money.js";
import { startOfTradingDay, tradingDayKey } from "../utils/tradingDay.js";

/**
 * Orders that represent real revenue.
 *
 * The two held statuses are excluded alongside cancellations. An order waiting
 * on a deposit or on a member of staff has not been accepted by anyone — the
 * kitchen has not been told it exists, and the guest may walk away from the
 * deposit. Counting it as takings would report money the restaurant has not
 * agreed to earn, and would make the figure jump backwards when the hold is
 * eventually abandoned.
 */
const HELD_STATUSES = ["NEEDS_APPROVAL", "AWAITING_ADVANCE_PAYMENT"] as const;

const REVENUE_STATUSES: Prisma.EnumOrderStatusFilter = {
  notIn: ["CANCELLED", ...HELD_STATUSES],
};

/**
 * The same exclusion for the raw-SQL reports below.
 *
 * Two fragments because the queries alias the orders table differently, and
 * one shared constant because four hand-written copies of this list is how a
 * new status ends up counted as revenue in three reports and not the fourth.
 */
const REVENUE_ONLY = Prisma.sql`status NOT IN ('CANCELLED', 'NEEDS_APPROVAL', 'AWAITING_ADVANCE_PAYMENT')`;
const REVENUE_ONLY_JOINED = Prisma.sql`o.status NOT IN ('CANCELLED', 'NEEDS_APPROVAL', 'AWAITING_ADVANCE_PAYMENT')`;

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
    heldCount,
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
    // Orders the kitchen has NOT been told about, waiting on a deposit or on a
    // member of staff. Surfaced on the dashboard because nothing moves them on
    // its own — a held order nobody notices is a guest sitting at a table
    // watching a screen that never changes.
    prisma.order.count({ where: { status: { in: [...HELD_STATUSES] } } }),
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
      held: heldCount,
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
    WHERE ${REVENUE_ONLY}
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

/** How "highest selling" is ranked. */
export type TopItemsSort = "quantity" | "revenue";

/** Which orders count towards the figures. */
export type TopItemsScope = "completed" | "all";

export interface TopItemsOptions {
  from?: Date;
  to?: Date;
  limit?: number;
  sort?: TopItemsSort;
  scope?: TopItemsScope;
}

/**
 * Highest-selling menu items, by quantity sold or by revenue generated.
 *
 * Defaults to COMPLETED orders — those that reached SERVED. An order still in
 * the pass may yet be cancelled or amended, so counting it would make the
 * ranking move backwards during service, and "best seller" would mean
 * "currently on a hotplate". `scope=all` widens it to every non-cancelled
 * order for a manager who wants the day's demand rather than its deliveries.
 *
 * Cancelled orders are excluded under both scopes: food that was never served
 * was never sold.
 */
export const getTopSellingItems = async ({
  from,
  to,
  limit = 10,
  sort = "quantity",
  scope = "completed",
}: TopItemsOptions = {}) => {
  const completedOnly = scope === "completed";

  /**
   * Raw SQL because the aggregate spans two tables and must run in the
   * database, not in Node — see the note at the top of this file.
   *
   * Both the sort column and the status filter are BOOLEAN FLAGS bound as
   * parameters and resolved inside the query, never string-interpolated. A
   * caller cannot reach the SQL text: `sort` and `scope` are already narrowed
   * to their unions by Zod, and even so nothing derived from them is
   * concatenated in.
   */
  const rows = await prisma.$queryRaw<
    { foodId: string; foodName: string; quantity: bigint; revenue: string }[]
  >`
    SELECT
      oi."foodId"         AS "foodId",
      oi."foodName"       AS "foodName",
      SUM(oi.quantity)    AS quantity,
      SUM(oi."lineTotal") AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE ${REVENUE_ONLY_JOINED}
      AND (${!completedOnly}::boolean OR o.status = 'SERVED')
      AND o."placedAt" >= ${from ?? new Date(0)}
      AND o."placedAt" <= ${to ?? new Date(8.64e15)}
    GROUP BY oi."foodId", oi."foodName"
    ORDER BY
      CASE WHEN ${sort === "revenue"}::boolean THEN SUM(oi."lineTotal") END DESC,
      SUM(oi.quantity) DESC
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
    WHERE ${REVENUE_ONLY_JOINED}
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
     WHERE status NOT IN ('CANCELLED', 'NEEDS_APPROVAL', 'AWAITING_ADVANCE_PAYMENT')
       AND "placedAt" >= $1
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
