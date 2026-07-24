/**
 * Reservation business logic.
 *
 * Capacity is checked against SEATS, not tables. A restaurant with forty
 * covers can take four parties of ten or twenty of two; counting bookings
 * would refuse the second case and overbook the first.
 */

import crypto from "node:crypto";

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import type {
  CreateReservationInput,
  ReservationListQuery,
  ReservationStatus,
  UpdateReservationInput,
} from "../validations/reservation.validation.js";

const reservationInclude = {
  table: { select: { id: true, tableNumber: true, capacity: true } },
  customer: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.ReservationInclude;

/** Bookings that still occupy capacity. */
const ACTIVE_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

/**
 * Legal status transitions.
 *
 * NO_SHOW is reachable only from CONFIRMED: a booking nobody accepted cannot
 * be a no-show, and a seated party plainly showed up.
 */
const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "CANCELLED", "NO_SHOW"],
  SEATED: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/**
 * Short booking reference.
 *
 * Six characters from an alphabet with no O/0 or I/1, because guests read
 * these aloud over the phone and misheard characters cost a table.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateReference = (): string => {
  const bytes = crypto.randomBytes(6);

  return `R-${[...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("")}`;
};

/** Total seats the house can serve at once. */
const totalCapacity = async (): Promise<number> => {
  const result = await prisma.table.aggregate({
    _sum: { capacity: true },
    where: { isActive: true },
  });

  return result._sum.capacity ?? 0;
};

/**
 * Seats already committed in a window overlapping the requested one.
 *
 * Two bookings clash when one starts before the other ends and vice versa.
 * Comparing start times alone would let a 19:00 and a 19:30 booking both
 * claim the same seats.
 */
const seatsTakenDuring = async (
  start: Date,
  durationMinutes: number,
  excludeId?: string
): Promise<number> => {
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  // Widest possible sitting, so the candidate set is small but complete.
  const windowStart = new Date(start.getTime() - 6 * 3_600_000);

  const nearby = await prisma.reservation.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      reservedAt: { gte: windowStart, lte: end },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { partySize: true, reservedAt: true, durationMinutes: true },
  });

  return nearby
    .filter((booking) => {
      const bookingEnd = new Date(
        booking.reservedAt.getTime() + booking.durationMinutes * 60_000
      );

      return booking.reservedAt < end && bookingEnd > start;
    })
    .reduce((sum, booking) => sum + booking.partySize, 0);
};

/** Seats free for a given moment. */
export const checkAvailability = async (
  reservedAt: Date,
  partySize: number,
  durationMinutes = 90
) => {
  const [capacity, taken] = await Promise.all([
    totalCapacity(),
    seatsTakenDuring(reservedAt, durationMinutes),
  ]);

  const remaining = capacity - taken;

  return {
    available: remaining >= partySize,
    seatsRemaining: Math.max(0, remaining),
    totalCapacity: capacity,
  };
};

/**
 * Suggests bookable times around a requested one.
 *
 * Offered when the requested slot is full, so the guest is never left at a
 * dead end with only "unavailable".
 */
export const suggestSlots = async (around: Date, partySize: number) => {
  const offsets = [-90, -60, -30, 30, 60, 90, 120];

  const results = await Promise.all(
    offsets.map(async (minutes) => {
      const slot = new Date(around.getTime() + minutes * 60_000);

      if (slot.getTime() < Date.now()) return null;

      const { available } = await checkAvailability(slot, partySize);

      return available ? slot.toISOString() : null;
    })
  );

  return results.filter((slot): slot is string => slot !== null);
};

export const createReservation = async (input: CreateReservationInput) => {
  const durationMinutes = 90;

  const availability = await checkAvailability(
    input.reservedAt,
    input.partySize,
    durationMinutes
  );

  if (!availability.available) {
    const alternatives = await suggestSlots(input.reservedAt, input.partySize);

    throw AppError.conflict(
      alternatives.length > 0
        ? "That time is fully booked. Nearby times are available."
        : "We are fully booked around that time. Please call the restaurant.",
      { seatsRemaining: availability.seatsRemaining, alternatives }
    );
  }

  // Link a returning guest by phone so their history accumulates, exactly as
  // ordering does — the same person should not become two records.
  const customer = await prisma.customer.upsert({
    where: { phone: input.phone },
    update: { name: input.name, email: input.email ?? undefined },
    create: { phone: input.phone, name: input.name, email: input.email },
  });

  return prisma.reservation.create({
    data: {
      reference: generateReference(),
      name: input.name,
      phone: input.phone,
      email: input.email,
      partySize: input.partySize,
      reservedAt: input.reservedAt,
      durationMinutes,
      occasion: input.occasion,
      notes: input.notes,
      customerId: customer.id,
    },
    include: reservationInclude,
  });
};

/** Public lookup by reference — returns only what the guest already knows. */
export const findByReference = async (reference: string) => {
  const reservation = await prisma.reservation.findUnique({
    where: { reference: reference.toUpperCase() },
    select: {
      reference: true,
      name: true,
      partySize: true,
      reservedAt: true,
      status: true,
      occasion: true,
      table: { select: { tableNumber: true } },
    },
  });

  if (!reservation) {
    throw AppError.notFound("No booking found with that reference");
  }

  return reservation;
};

export const getReservationById = async (id: string) => {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: reservationInclude,
  });

  if (!reservation) {
    throw AppError.notFound("Reservation not found");
  }

  return reservation;
};

export const listReservations = async (
  query: ReservationListQuery
): Promise<{ reservations: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  let from = query.from;
  let to = query.to;

  if (query.today === "true") {
    const now = new Date();
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to = new Date(from.getTime() + 86_400_000);
  }

  const where: Prisma.ReservationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(from || to
      ? {
          reservedAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { phone: { contains: query.search } },
            { reference: { contains: query.search.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [reservations, total] = await prisma.$transaction([
    prisma.reservation.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      // Soonest first: the floor cares about who is arriving next.
      orderBy: { reservedAt: "asc" },
      include: reservationInclude,
    }),
    prisma.reservation.count({ where }),
  ]);

  return { reservations, meta: buildPaginationMeta(pagination, total) };
};

export const updateReservation = async (
  id: string,
  input: UpdateReservationInput
) => {
  const existing = await getReservationById(id);

  // Re-check capacity when the size or time moves, excluding this booking so
  // it does not count itself as a clash.
  if (input.partySize || input.reservedAt) {
    const when = input.reservedAt ?? existing.reservedAt;
    const size = input.partySize ?? existing.partySize;
    const duration = input.durationMinutes ?? existing.durationMinutes;

    const capacity = await totalCapacity();
    const taken = await seatsTakenDuring(when, duration, id);

    if (capacity - taken < size) {
      throw AppError.conflict("Not enough seats free at that time");
    }
  }

  if (input.tableId) {
    const table = await prisma.table.findFirst({
      where: { id: input.tableId, isActive: true },
      select: { id: true, capacity: true },
    });

    if (!table) {
      throw AppError.badRequest("That table is not available");
    }

    const size = input.partySize ?? existing.partySize;

    if (table.capacity < size) {
      throw AppError.badRequest(
        `That table seats ${table.capacity}; the booking is for ${size}`
      );
    }
  }

  return prisma.reservation.update({
    where: { id },
    data: input,
    include: reservationInclude,
  });
};

export const updateReservationStatus = async (
  id: string,
  next: ReservationStatus,
  reason?: string
) => {
  const reservation = await getReservationById(id);
  const current = reservation.status as ReservationStatus;

  if (current === next) {
    throw AppError.conflict(`Booking is already ${next.toLowerCase()}`);
  }

  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    const allowed = ALLOWED_TRANSITIONS[current];

    throw AppError.conflict(
      allowed.length === 0
        ? `This booking is ${current.toLowerCase()} and can no longer change`
        : `Cannot go from ${current} to ${next}. Allowed: ${allowed.join(", ")}`
    );
  }

  const stamps: Partial<Record<ReservationStatus, string>> = {
    CONFIRMED: "confirmedAt",
    SEATED: "seatedAt",
    CANCELLED: "cancelledAt",
  };

  const field = stamps[next];

  const updated = await prisma.reservation.update({
    where: { id },
    data: {
      status: next,
      ...(field ? { [field]: new Date() } : {}),
      ...(reason ? { cancelReason: reason } : {}),
    },
    include: reservationInclude,
  });

  // Keep the floor plan honest: a seated party occupies its table, and a
  // finished one releases it.
  if (updated.tableId) {
    if (next === "SEATED") {
      await prisma.table.update({
        where: { id: updated.tableId },
        data: { status: "OCCUPIED" },
      });
    } else if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(next)) {
      await prisma.table.update({
        where: { id: updated.tableId },
        data: { status: "AVAILABLE" },
      });
    }
  }

  return updated;
};

/** Cancellation by the guest, using only the reference they hold. */
export const cancelByReference = async (reference: string, phone: string) => {
  const reservation = await prisma.reservation.findUnique({
    where: { reference: reference.toUpperCase() },
  });

  // The phone number must match: a reference alone is short enough to guess,
  // and cancelling someone else's table must not be possible.
  if (!reservation || reservation.phone !== phone) {
    throw AppError.notFound("No booking found with that reference and number");
  }

  if (!ALLOWED_TRANSITIONS[reservation.status as ReservationStatus].includes("CANCELLED")) {
    throw AppError.conflict("This booking can no longer be cancelled online");
  }

  return prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "Cancelled by guest",
    },
    select: { reference: true, status: true },
  });
};
