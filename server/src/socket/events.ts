/**
 * Socket event names and room naming.
 *
 * Centralised as constants so the server and the React client cannot drift:
 * a mistyped event string fails silently on both ends, with no error anywhere
 * to tell you the listener simply never fires.
 */

export const SOCKET_EVENTS = {
  /** A customer placed a new order. Kitchen and admin dashboards react. */
  ORDER_CREATED: "order:created",
  /** An order moved through the status workflow. */
  ORDER_STATUS_CHANGED: "order:statusChanged",
  /** Items were added to an existing order. */
  ORDER_UPDATED: "order:updated",
  /** An order was cancelled. */
  ORDER_CANCELLED: "order:cancelled",
  /** A menu item was marked sold out or available again. */
  FOOD_AVAILABILITY_CHANGED: "food:availabilityChanged",
  /** A table changed occupancy. */
  TABLE_STATUS_CHANGED: "table:statusChanged",
  /** A new notification for staff — drives the notification bell. */
  NOTIFICATION_NEW: "notification:new",
} as const;

/**
 * Rooms.
 *
 * Broadcasting to everyone would send kitchen traffic to customer phones and
 * customer order data to unrelated diners. Rooms scope each message to the
 * audience entitled to it.
 */
export const ROOMS = {
  /** Staff who work the Kitchen Display. */
  KITCHEN: "room:kitchen",
  /** Admin and super admin dashboards. */
  ADMIN: "room:admin",
  /** All authenticated staff. */
  STAFF: "room:staff",
  /**
   * One room per order, joined by the anonymous customer tracking it.
   *
   * Scoped by the order's TRACKING TOKEN, never its order number. Order
   * numbers come from a sequence, so a room named after one could be joined
   * by anyone counting upwards — which would turn this room into a feed of
   * other people's orders. The token is 32 random bytes and is given only to
   * the diner who placed the order.
   */
  order: (trackingToken: string): string => `room:order:${trackingToken}`,
} as const;
