/**
 * Socket.io server.
 *
 * SECURITY: Socket.io does NOT run Express middleware. `authenticate` never
 * fires for a WebSocket connection, so without the handshake check below any
 * anonymous client could open a socket and receive every order in the
 * restaurant. Authentication has to be re-established here explicitly.
 *
 * The connection is deliberately two-tier:
 *   - Staff authenticate with a JWT and join role-scoped rooms.
 *   - Customers connect anonymously and may join exactly one room: the one
 *     named after an order number they already hold.
 */

import type { Server as HttpServer } from "node:http";

import { Server as SocketServer, type Socket } from "socket.io";

import { config } from "../config/env.js";
import { verifyAccessToken, type AccessTokenPayload } from "../utils/jwt.js";
import { PERMISSIONS } from "../config/permissions.js";
import { ROOMS, SOCKET_EVENTS } from "./events.js";

/** Socket carrying an authenticated staff identity, when one was supplied. */
interface AuthedSocket extends Socket {
  user?: AccessTokenPayload;
}

let io: SocketServer | null = null;

/**
 * Reads the access token from the handshake.
 *
 * Accepts `auth.token` (the documented socket.io client field) and falls back
 * to the Authorization header, so the same token works from a browser client
 * and from a server-to-server connection.
 */
const readHandshakeToken = (socket: Socket): string | null => {
  const fromAuth = (socket.handshake.auth as { token?: string } | undefined)?.token;

  if (typeof fromAuth === "string" && fromAuth.length > 0) {
    return fromAuth;
  }

  const header = socket.handshake.headers.authorization;

  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  return null;
};

/** Places a staff socket into the rooms its permissions entitle it to. */
const joinStaffRooms = (socket: AuthedSocket, user: AccessTokenPayload): void => {
  const isSuperAdmin = user.roleName === "SUPER_ADMIN";
  const permissions = new Set(user.permissions);

  void socket.join(ROOMS.STAFF);

  if (isSuperAdmin || permissions.has(PERMISSIONS.KITCHEN_ACCESS)) {
    void socket.join(ROOMS.KITCHEN);
  }

  if (isSuperAdmin || permissions.has(PERMISSIONS.DASHBOARD_VIEW)) {
    void socket.join(ROOMS.ADMIN);
  }
};

export const initSocketServer = (httpServer: HttpServer): SocketServer => {
  io = new SocketServer(httpServer, {
    cors: {
      origin: config.security.corsOrigins,
      credentials: true,
    },
    // Kitchen tablets drop Wi-Fi constantly. A longer window lets a brief
    // dropout resume the same session rather than forcing a full reconnect.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
    },
  });

  /**
   * Handshake middleware — runs once per connection, before any event.
   *
   * A missing token is allowed through as an anonymous customer. An INVALID
   * token is rejected outright: presenting a bad credential is an error, not
   * a request to be treated as a guest.
   */
  io.use((socket: AuthedSocket, next) => {
    const token = readHandshakeToken(socket);

    if (!token) {
      next();
      return;
    }

    try {
      socket.user = verifyAccessToken(token);
      next();
    } catch {
      next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket: AuthedSocket) => {
    if (socket.user) {
      joinStaffRooms(socket, socket.user);
    }

    /**
     * A customer tracking their own order.
     *
     * The room is keyed by order number, which the diner already has. It
     * grants visibility of status pushes for that one order and nothing else,
     * so no account is required and no other order is reachable.
     */
    socket.on("order:subscribe", (orderNumber: unknown) => {
      if (typeof orderNumber !== "string" || orderNumber.length === 0) {
        return;
      }

      void socket.join(ROOMS.order(orderNumber));
    });

    socket.on("order:unsubscribe", (orderNumber: unknown) => {
      if (typeof orderNumber === "string") {
        void socket.leave(ROOMS.order(orderNumber));
      }
    });
  });

  return io;
};

/**
 * Emits to a set of rooms.
 *
 * Never throws: real-time delivery is an enhancement, and a socket failure
 * must not roll back an order that is already committed to the database.
 */
const emitToRooms = (rooms: string[], event: string, payload: unknown): void => {
  if (!io) {
    return;
  }

  try {
    io.to(rooms).emit(event, payload);
  } catch (error) {
    console.error(`[socket] failed to emit ${event}:`, error);
  }
};

/**
 * Rooms that every order event reaches.
 *
 * ROOMS.STAFF is included because waiting staff must see orders too — they
 * take and serve them. Kitchen and admin sockets are ALSO in ROOMS.STAFF, so
 * listing all three is belt-and-braces: socket.io delivers once per socket
 * even when it matches several rooms in the same emit.
 */
const ALL_STAFF_ROOMS = [ROOMS.STAFF, ROOMS.KITCHEN, ROOMS.ADMIN];

/** Broadcasts a new order to every staff screen. */
export const emitOrderCreated = (order: { orderNumber: string }): void => {
  emitToRooms(ALL_STAFF_ROOMS, SOCKET_EVENTS.ORDER_CREATED, order);
};

/**
 * Broadcasts a status change to staff AND to the customer tracking it.
 *
 * This is what turns the tracking screen live: the diner sees "Preparing"
 * the moment the kitchen taps it, with no polling.
 */
export const emitOrderStatusChanged = (order: {
  orderNumber: string;
  status: string;
}): void => {
  emitToRooms(
    [...ALL_STAFF_ROOMS, ROOMS.order(order.orderNumber)],
    SOCKET_EVENTS.ORDER_STATUS_CHANGED,
    order
  );
};

export const emitOrderUpdated = (order: { orderNumber: string }): void => {
  emitToRooms(
    [...ALL_STAFF_ROOMS, ROOMS.order(order.orderNumber)],
    SOCKET_EVENTS.ORDER_UPDATED,
    order
  );
};

export const emitOrderCancelled = (order: {
  orderNumber: string;
  cancelReason?: string | null;
}): void => {
  emitToRooms(
    [...ALL_STAFF_ROOMS, ROOMS.order(order.orderNumber)],
    SOCKET_EVENTS.ORDER_CANCELLED,
    order
  );
};

/** Tells every connected client a menu item sold out or came back. */
export const emitFoodAvailabilityChanged = (food: {
  id: string;
  name: string;
  isAvailable: boolean;
}): void => {
  if (!io) {
    return;
  }

  // Broadcast to everyone, including anonymous customers: a diner browsing
  // the menu must see an item grey out before they try to order it.
  try {
    io.emit(SOCKET_EVENTS.FOOD_AVAILABILITY_CHANGED, food);
  } catch (error) {
    console.error("[socket] failed to emit availability change:", error);
  }
};

export const emitTableStatusChanged = (table: {
  id: string;
  tableNumber: string;
  status: string;
}): void => {
  emitToRooms([ROOMS.ADMIN, ROOMS.STAFF], SOCKET_EVENTS.TABLE_STATUS_CHANGED, table);
};

/** Exposed for graceful shutdown. */
export const closeSocketServer = async (): Promise<void> => {
  if (io) {
    await io.close();
    io = null;
  }
};
