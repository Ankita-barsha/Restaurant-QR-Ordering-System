/**
 * Staff notifications.
 *
 * Notifications are broadcast to all staff (userId = null) and each staff
 * member's "read" state is tracked per row once they open it. Customers are
 * NOT notified here — their live order tracking already reflects every stage,
 * and they have no account to attach a notification to.
 *
 * Creating a notification must never break the action that triggered it, so
 * recordNotification swallows its own errors, exactly like the audit trail.
 */

import type { NotificationType, Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
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
 * A notification is "read" for a user when a NotificationRead row exists —
 * but rather than add a table, read state is stored on the row itself and
 * only broadcast notifications (userId null) are shared. To keep per-user
 * read state simple without a new model, we treat isRead as global once any
 * staff marks it, which suits a small team sharing one board.
 *
 * List the most recent notifications for the bell.
 */
export const listNotifications = async (limit = 30) => {
  return prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
};

export const unreadCount = async (): Promise<number> => {
  return prisma.notification.count({ where: { isRead: false } });
};

export const markRead = async (id: string): Promise<void> => {
  await prisma.notification.updateMany({
    where: { id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
};

export const markAllRead = async (): Promise<number> => {
  const result = await prisma.notification.updateMany({
    where: { isRead: false },
    data: { isRead: true, readAt: new Date() },
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
