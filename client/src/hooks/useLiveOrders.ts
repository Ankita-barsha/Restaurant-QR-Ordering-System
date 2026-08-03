/**
 * Real-time bridge between Socket.io and React Query.
 *
 * The socket does NOT carry the new data into the UI directly. It invalidates
 * the relevant query, and React Query refetches.
 *
 * That indirection is deliberate: patching the cache from a socket payload
 * means two code paths producing the same view, which drift. Invalidate-and-
 * refetch keeps the server as the single source of truth, and a missed event
 * (dropped Wi-Fi) self-corrects on the next refetch rather than leaving the
 * kitchen permanently stale.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getSocket, SOCKET_EVENTS } from "../lib/socket";

/** Query keys, centralised so invalidation cannot miss a consumer. */
export const queryKeys = {
  foods: ["foods"] as const,
  categories: ["categories"] as const,
  orders: ["orders"] as const,
  kitchen: ["orders", "kitchen"] as const,
  tables: ["tables"] as const,
  dashboard: ["dashboard"] as const,
  order: (id: string) => ["orders", id] as const,
  track: (orderNumber: string) => ["track", orderNumber] as const,
};

/**
 * Subscribes staff views to live order activity.
 *
 * Used by the Kitchen Display, the admin dashboard and the staff panel — all
 * three need the same invalidations, so they share one hook.
 */
export const useLiveOrders = (): void => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    };

    const events = [
      SOCKET_EVENTS.ORDER_CREATED,
      SOCKET_EVENTS.ORDER_STATUS_CHANGED,
      SOCKET_EVENTS.ORDER_UPDATED,
      SOCKET_EVENTS.ORDER_CANCELLED,
      // A held order never fires ORDER_CREATED, so without this the floor
      // would not learn a large order is sitting there waiting for them.
      SOCKET_EVENTS.ORDER_NEEDS_APPROVAL,
    ];

    for (const event of events) {
      socket.on(event, refresh);
    }

    const refreshMenu = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.foods });
    };

    socket.on(SOCKET_EVENTS.FOOD_AVAILABILITY_CHANGED, refreshMenu);

    // Listeners are removed on unmount. Without this, navigating between
    // views stacks duplicate handlers and each event refetches N times.
    return () => {
      for (const event of events) {
        socket.off(event, refresh);
      }
      socket.off(SOCKET_EVENTS.FOOD_AVAILABILITY_CHANGED, refreshMenu);
    };
  }, [queryClient]);
};

/**
 * Subscribes a diner to their own order.
 *
 * Joins the room named after the order's TRACKING TOKEN, which only the diner
 * who placed it holds. Holding the token is what authorises the subscription;
 * no account is involved and no other order is reachable.
 */
export const useLiveOrderTracking = (trackingToken: string | undefined): void => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!trackingToken) return;

    const socket = getSocket();

    const join = () => socket.emit("order:subscribe", trackingToken);

    // Re-joined on every reconnect: rooms are per-connection, so a dropped
    // socket silently stops receiving updates unless it re-subscribes.
    join();
    socket.on("connect", join);

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.track(trackingToken) });
    };

    socket.on(SOCKET_EVENTS.ORDER_STATUS_CHANGED, refresh);
    socket.on(SOCKET_EVENTS.ORDER_UPDATED, refresh);
    socket.on(SOCKET_EVENTS.ORDER_CANCELLED, refresh);

    return () => {
      socket.emit("order:unsubscribe", trackingToken);
      socket.off("connect", join);
      socket.off(SOCKET_EVENTS.ORDER_STATUS_CHANGED, refresh);
      socket.off(SOCKET_EVENTS.ORDER_UPDATED, refresh);
      socket.off(SOCKET_EVENTS.ORDER_CANCELLED, refresh);
    };
  }, [trackingToken, queryClient]);
};

/** Live connection indicator, so a kitchen tablet shows when it goes offline. */
export const useSocketStatus = (): boolean => {
  const socket = getSocket();
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, setConnected]);

  return connected;
};
