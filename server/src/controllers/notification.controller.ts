import type { RequestHandler } from "express";

import * as notificationService from "../services/notification.service.js";
import { AppError } from "../utils/AppError.js";

type IdParams = { id: string };

/**
 * The signed-in staff member, whose own read state every route below acts on.
 *
 * `authenticate` guarantees req.user is present, but that guarantee lives in
 * middleware the type system cannot see, so it is asserted rather than assumed.
 */
const actorId = (req: { user?: { sub: string } }): string => {
  if (!req.user?.sub) {
    throw AppError.unauthorized();
  }

  return req.user.sub;
};

/** GET /api/notifications — recent notifications for THIS user's bell. */
export const list: RequestHandler = async (req, res) => {
  const userId = actorId(req);

  const [notifications, unread] = await Promise.all([
    notificationService.listNotifications(userId),
    notificationService.unreadCount(userId),
  ]);

  res.json({ success: true, data: { notifications, unread } });
};

/** PATCH /api/notifications/:id/read */
export const markRead: RequestHandler<IdParams> = async (req, res) => {
  await notificationService.markRead(req.params.id, actorId(req));

  res.json({ success: true, message: "Marked read" });
};

/** POST /api/notifications/read-all */
export const markAllRead: RequestHandler = async (req, res) => {
  const count = await notificationService.markAllRead(actorId(req));

  res.json({ success: true, message: `Marked ${count} read` });
};
