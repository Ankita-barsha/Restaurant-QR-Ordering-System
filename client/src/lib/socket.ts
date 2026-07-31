/**
 * Socket.io client.
 *
 * One shared connection for the whole app. Opening a socket per component
 * would multiply connections on every render and exhaust the server.
 */

import { io, type Socket } from "socket.io-client";

import { config } from "../config/env";
import { getAccessToken } from "./api";

let socket: Socket | null = null;

/**
 * Returns the shared socket, connecting on first use.
 *
 * The access token is read at CONNECT time. Staff sockets authenticate and
 * join role rooms; customer sockets connect anonymously and subscribe to a
 * single order by number.
 */
export const getSocket = (): Socket => {
  socket ??= io(config.apiUrl, {
    // Skips the HTTP long-polling handshake; the dev server supports
    // websockets directly and this removes a round trip.
    transports: ["websocket"],
    autoConnect: true,
    auth: { token: getAccessToken() ?? undefined },
    // Kitchen tablets drop Wi-Fi constantly, so reconnect aggressively but
    // back off so a downed server is not hammered.
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });

  return socket;
};

/**
 * Reconnects with the current token.
 *
 * Called after login and logout: the handshake carries the token, so an
 * already-open anonymous socket cannot become a staff socket without
 * reconnecting.
 */
export const reconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  getSocket();
};

export const disconnectSocket = (): void => {
  socket?.disconnect();
  socket = null;
};

/** Event names — must match server/src/socket/events.ts exactly. */
export const SOCKET_EVENTS = {
  ORDER_CREATED: "order:created",
  ORDER_STATUS_CHANGED: "order:statusChanged",
  ORDER_UPDATED: "order:updated",
  ORDER_CANCELLED: "order:cancelled",
  FOOD_AVAILABILITY_CHANGED: "food:availabilityChanged",
  TABLE_STATUS_CHANGED: "table:statusChanged",
  NOTIFICATION_NEW: "notification:new",
  REVIEW_CHANGED: "review:changed",
  /** Payment lifecycle update — waiter and admin payment screens react live. */
  PAYMENT_STATUS_CHANGED: "payment:statusChanged",
  /** Kitchen marked an order READY — waiter screen alerts immediately. */
  WAITER_ORDER_READY: "waiter:orderReady",
} as const;

