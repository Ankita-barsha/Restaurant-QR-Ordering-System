/**
 * Notification bell.
 *
 * Lives in the staff shell. Shows an unread count and, on click, a panel of
 * recent notifications. New notifications arrive live over Socket.IO and bump
 * the badge without a refresh; a soft chime is intentionally omitted, since a
 * busy floor does not want the browser making noise.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, unwrap } from "../lib/api";
import { getSocket, SOCKET_EVENTS } from "../lib/socket";
import { timeAgo } from "../lib/format";
import type { ApiResponse } from "../types/api";

interface StaffNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPayload {
  notifications: StaffNotification[];
  unread: number;
}

const NOTIFICATIONS_KEY = ["notifications"] as const;

const NotificationBell = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<NotificationPayload>>("/notifications")),
    // Socket pushes drive freshness; this is only a slow safety net.
    refetchInterval: 60_000,
  });

  // Live badge: a new notification invalidates the query, which refetches.
  useEffect(() => {
    const socket = getSocket();

    const onNew = () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    };

    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, onNew);

    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, onNew);
    };
  }, [queryClient]);

  // Click outside closes the panel.
  useEffect(() => {
    if (!open) return;

    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAllRead = useMutation({
    mutationFn: async () => api.post("/notifications/read-all"),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });

  const unread = query.data?.unread ?? 0;
  const notifications = query.data?.notifications ?? [];

  return (
    <div ref={panelRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ivory-faint transition-colors hover:text-gold"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>

        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[9px] font-semibold text-obsidian">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-rise absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-smoke bg-charcoal shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between border-b border-smoke px-4 py-3">
            <span className="text-[11px] uppercase tracking-[0.2em] text-ivory">
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-[10px] uppercase tracking-[0.16em] text-gold hover:text-gold-light"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-ivory-faint">
                Nothing yet. New orders will appear here.
              </p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex gap-3 border-b border-smoke/60 px-4 py-3 ${
                    notification.isRead ? "opacity-60" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      notification.isRead ? "bg-transparent" : "bg-gold"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ivory">
                      {notification.title}
                    </p>
                    <p className="truncate text-[12px] text-ivory-dim">
                      {notification.message}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-ivory-faint">
                      {timeAgo(notification.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
