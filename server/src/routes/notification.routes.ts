import { Router } from "express";

import * as notificationController from "../controllers/notification.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";

const router = Router();

/**
 * Any signed-in staff member may read and clear notifications — there is no
 * finer permission, because the board is shared across the team. No public
 * access: customers track their order directly instead.
 */
router.use(authenticate);

router.get("/", notificationController.list);

router.patch(
  "/:id/read",
  validate({ params: idParamSchema }),
  notificationController.markRead
);

router.post("/read-all", notificationController.markAllRead);

export default router;
