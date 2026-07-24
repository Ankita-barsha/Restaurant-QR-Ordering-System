import { Router } from "express";
import { z } from "zod";

import { PERMISSIONS } from "../config/permissions.js";
import * as reservationController from "../controllers/reservation.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  availabilityQuerySchema,
  createReservationSchema,
  referenceParamSchema,
  reservationListQuerySchema,
  reservationStatusUpdateSchema,
  updateReservationSchema,
} from "../validations/reservation.validation.js";

const router = Router();

/**
 * PUBLIC — the booking flow.
 *
 * Literal paths are registered before "/:id" so Express does not treat
 * "availability" or "lookup" as a reservation id.
 */
router.get(
  "/availability",
  validate({ query: availabilityQuerySchema }),
  reservationController.availability
);

router.post(
  "/",
  validate({ body: createReservationSchema }),
  reservationController.create
);

router.get(
  "/lookup/:reference",
  validate({ params: referenceParamSchema }),
  reservationController.lookup
);

/**
 * Guest cancellation requires the phone number as well as the reference.
 * A six-character code alone is short enough to guess, and cancelling
 * someone else's table must not be possible.
 */
router.post(
  "/lookup/:reference/cancel",
  validate({
    params: referenceParamSchema,
    body: z.object({ phone: z.string().trim().min(6) }),
  }),
  reservationController.cancelByGuest
);

/** PROTECTED — the house's view. */
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.RESERVATION_READ),
  validate({ query: reservationListQuerySchema }),
  reservationController.list
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.RESERVATION_READ),
  validate({ params: idParamSchema }),
  reservationController.getById
);

router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.RESERVATION_UPDATE),
  validate({ params: idParamSchema, body: updateReservationSchema }),
  audit({ action: "reservation.update", entity: "Reservation" }),
  reservationController.update
);

router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.RESERVATION_UPDATE),
  validate({ params: idParamSchema, body: reservationStatusUpdateSchema }),
  audit({ action: "reservation.updateStatus", entity: "Reservation" }),
  reservationController.updateStatus
);

export default router;
