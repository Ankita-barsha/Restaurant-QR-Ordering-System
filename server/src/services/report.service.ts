/**
 * Reports and analytics.
 *
 * Aggregation runs in the DATABASE, not in JavaScript. Fetching every order
 * and reducing it in Node works against seed data and falls over at scale:
 * it pulls the whole table across the wire and holds it in memory.
 *
 * Cancelled orders are excluded from revenue everywhere. Including them would
 * report money that was never taken.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { fromMinorUnits, toMinorUnits } from "../utils/money.js";

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

/** Start of the current day in server local time. */
const startOfToday = (): Date => {
  const now = new Date();

  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/**
 * Dashboard summary: today's trading plus live operational counts.
 */
export const getDashboardSummary = async () => {
  const todayStart = startOfToday();

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

  // Raw SQL because Prisma's groupBy cannot group a DateTime by day; doing it
  // in JavaScript would mean loading every order in the range.
  const rows = await prisma.$queryRaw<
    { day: Date; orders: bigint; revenue: string | null }[]
  >`
    SELECT
      date_trunc('day', "placedAt") AS day,
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
      date: row.day.toISOString().slice(0, 10),
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
