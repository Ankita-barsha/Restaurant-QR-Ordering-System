/**
 * Staff notifications.
 *
 * Notifications are broadcast to all staff (userId = null); a row may also be
 * addressed to one person. Customers are NOT notified here — their live order
 * tracking already reflects every stage, and they have no account to attach a
 * notification to.
 *
 * READ STATE IS PER STAFF MEMBER. It lives in NotificationRead, one row per
 * (notification, user), never as a flag on the notification itself: a shared
 * flag meant the chef clearing their bell also cleared it for every waiter, so
 * a new order could vanish from a screen nobody had looked at.
 *
 * Creating a notification must never break the action that triggered it, so
 * recordNotification swallows its own errors, exactly like the audit trail.
 */

import type { NotificationType, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import { emitNotification } from "../socket/index.js";

interface CreateInput {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Persists a broadcast notification and pushes it to connected staff.
 *
 * Fire-and-forget: callers do not await a result they would have to handle,
 * and any failure is logged rather than thrown.
 */
export const recordNotification = async (input: CreateInput): Promise<void> => {
  try {
    const notification = await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata,
      },
    });

    emitNotification({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
      metadata: notification.metadata,
    });
  } catch (error) {
    console.error("[notification] failed to record:", input.title, error);
  }
};

/**
 * Notifications this user is entitled to see: broadcasts, plus any addressed
 * to them personally.
 */
const visibleTo = (userId: string): Prisma.NotificationWhereInput => ({
  OR: [{ userId: null }, { userId }],
});

/**
 * The most recent notifications for one staff member's bell, each carrying
 * THAT person's read state.
 */
export const listNotifications = async (userId: string, limit = 30) => {
  const notifications = await prisma.notification.findMany({
    where: visibleTo(userId),
    orderBy: { createdAt: "desc" },
    take: limit,
    // Only this user's read row is joined, so `reads` is either empty or a
    // single entry — which is exactly the boolean the bell needs.
    include: { reads: { where: { userId }, select: { readAt: true } } },
  });

  return notifications.map(({ reads, ...notification }) => ({
    ...notification,
    isRead: reads.length > 0,
    readAt: reads[0]?.readAt ?? null,
  }));
};

/** How many of this user's visible notifications they have not opened. */
export const unreadCount = async (userId: string): Promise<number> => {
  return prisma.notification.count({
    where: {
      ...visibleTo(userId),
      // "none" over the join, filtered to this user: unread means no read row
      // of their own, regardless of who else has read it.
      reads: { none: { userId } },
    },
  });
};

/**
 * Marks one notification read for one user.
 *
 * upsert, not create: opening the same notification twice is idempotent rather
 * than a unique-constraint error.
 */
export const markRead = async (id: string, userId: string): Promise<void> => {
  // Checked first so an unknown id is a clear 404 rather than a foreign-key
  // violation, and so one user cannot mark another's private notification.
  const exists = await prisma.notification.findFirst({
    where: { id, ...visibleTo(userId) },
    select: { id: true },
  });

  if (!exists) {
    throw AppError.notFound("Notification not found");
  }

  await prisma.notificationRead.upsert({
    where: { notificationId_userId: { notificationId: id, userId } },
    update: {},
    create: { notificationId: id, userId },
  });
};

/** Clears this user's bell. Returns how many were newly marked. */
export const markAllRead = async (userId: string): Promise<number> => {
  const unread = await prisma.notification.findMany({
    where: { ...visibleTo(userId), reads: { none: { userId } } },
    select: { id: true },
  });

  if (unread.length === 0) {
    return 0;
  }

  // skipDuplicates guards the race where the same person clears the bell from
  // two tabs at once.
  const result = await prisma.notificationRead.createMany({
    data: unread.map((notification) => ({
      notificationId: notification.id,
      userId,
    })),
    skipDuplicates: true,
  });

  return result.count;
};

// ---------------------------------------------------------------------------
// Domain helpers — called from the order lifecycle.
// ---------------------------------------------------------------------------

export const notifyOrderPlaced = (order: {
  id: string;
  orderNumber: string;
  table: { tableNumber: string } | null;
}): void => {
  void recordNotification({
    type: "ORDER_PLACED",
    title: "New order",
    message: `${order.orderNumber} placed${
      order.table ? ` at table ${order.table.tableNumber}` : ""
    }`,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
  });
};

/**
 * A large order is being held before the kitchen is told about it.
 *
 * Worth a notification of its own, and an urgent one: unlike a placed order,
 * NOTHING happens next until a member of staff acts. A guest is sitting at a
 * table waiting, and the kitchen has not even been told.
 */
export const notifyOrderHeld = (order: {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: { toString(): string };
  table: { tableNumber: string } | null;
}): void => {
  const where = order.table ? `table ${order.table.tableNumber}` : "a takeaway order";

  void recordNotification({
    type: "ORDER_PLACED",
    title:
      order.status === "AWAITING_PAYMENT"
        ? "Large order — deposit required"
        : "Large order — needs approval",
    message:
      order.status === "AWAITING_PAYMENT"
        ? `${order.orderNumber} (${order.totalAmount.toString()}) on ${where} is waiting for its deposit`
        : `${order.orderNumber} (${order.totalAmount.toString()}) on ${where} needs a member of staff before the kitchen starts`,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      held: order.status,
    },
  });
};

export const notifyOrderStatus = (order: {
  id: string;
  orderNumber: string;
  status: string;
}): void => {
  // Only the moments staff act on are worth a notification; every micro-step
  // would drown the bell.
  const headline: Record<string, string> = {
    READY: "Order ready to serve",
    SERVED: "Order served",
    CANCELLED: "Order cancelled",
  };

  const title = headline[order.status];
  if (!title) return;

  void recordNotification({
    type: "ORDER_STATUS_CHANGED",
    title,
    message: `${order.orderNumber} — ${order.status.toLowerCase()}`,
    metadata: { orderId: order.id, orderNumber: order.orderNumber },
  });
};
