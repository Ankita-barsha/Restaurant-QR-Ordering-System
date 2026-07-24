import type { RequestHandler } from "express";

import * as reservationService from "../services/reservation.service.js";
import type {
  CreateReservationInput,
  ReservationListQuery,
  ReservationStatus,
  UpdateReservationInput,
} from "../validations/reservation.validation.js";

type IdParams = { id: string };
type ReferenceParams = { reference: string };
type NoParams = Record<string, never>;

/** GET /api/reservations/availability — PUBLIC, used by the booking form. */
export const availability: RequestHandler = async (req, res) => {
  const { date, partySize } = req.validatedQuery as { date: Date; partySize: number };

  const result = await reservationService.checkAvailability(date, partySize);

  // Alternatives are computed only when needed, so the common case stays fast.
  const alternatives = result.available
    ? []
    : await reservationService.suggestSlots(date, partySize);

  res.json({ success: true, data: { ...result, alternatives } });
};

/** POST /api/reservations — PUBLIC. */
export const create: RequestHandler<NoParams, unknown, CreateReservationInput> = async (
  req,
  res
) => {
  const reservation = await reservationService.createReservation(req.body);

  res.status(201).json({
    success: true,
    message: "Your table is requested. We will confirm shortly.",
    data: reservation,
  });
};

/** GET /api/reservations/lookup/:reference — PUBLIC. */
export const lookup: RequestHandler<ReferenceParams> = async (req, res) => {
  const reservation = await reservationService.findByReference(req.params.reference);

  res.json({ success: true, data: reservation });
};

/** POST /api/reservations/lookup/:reference/cancel — PUBLIC, needs the phone. */
export const cancelByGuest: RequestHandler<
  ReferenceParams,
  unknown,
  { phone: string }
> = async (req, res) => {
  const result = await reservationService.cancelByReference(
    req.params.reference,
    req.body.phone
  );

  res.json({ success: true, message: "Your booking is cancelled", data: result });
};

/** GET /api/reservations */
export const list: RequestHandler = async (req, res) => {
  const { reservations, meta } = await reservationService.listReservations(
    req.validatedQuery as ReservationListQuery
  );

  res.json({ success: true, data: reservations, meta });
};

/** GET /api/reservations/:id */
export const getById: RequestHandler<IdParams> = async (req, res) => {
  res.json({
    success: true,
    data: await reservationService.getReservationById(req.params.id),
  });
};

/** PATCH /api/reservations/:id */
export const update: RequestHandler<IdParams, unknown, UpdateReservationInput> = async (
  req,
  res
) => {
  const reservation = await reservationService.updateReservation(
    req.params.id,
    req.body
  );

  res.json({ success: true, message: "Booking updated", data: reservation });
};

/** PATCH /api/reservations/:id/status */
export const updateStatus: RequestHandler<
  IdParams,
  unknown,
  { status: ReservationStatus; reason?: string }
> = async (req, res) => {
  const reservation = await reservationService.updateReservationStatus(
    req.params.id,
    req.body.status,
    req.body.reason
  );

  res.json({
    success: true,
    message: `Booking marked ${req.body.status.toLowerCase()}`,
    data: reservation,
  });
};
