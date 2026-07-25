import type { RequestHandler } from "express";

import * as notificationService from "../services/notification.service.js";

type IdParams = { id: string };

/** GET /api/notifications — recent staff notifications for the bell. */
export const list: RequestHandler = async (_req, res) => {
  const [notifications, unread] = await Promise.all([
    notificationService.listNotifications(),
    notificationService.unreadCount(),
  ]);

  res.json({ success: true, data: { notifications, unread } });
};

/** PATCH /api/notifications/:id/read */
export const markRead: RequestHandler<IdParams> = async (req, res) => {
  await notificationService.markRead(req.params.id);

  res.json({ success: true, message: "Marked read" });
};

/** POST /api/notifications/read-all */
export const markAllRead: RequestHandler = async (_req, res) => {
  const count = await notificationService.markAllRead();

  res.json({ success: true, message: `Marked ${count} read` });
};
