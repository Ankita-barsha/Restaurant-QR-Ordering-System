/**
 * Restaurant settings and customer records.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import type {
  CustomerListQuery,
  UpdateCustomerInput,
  UpdateSettingsInput,
} from "../validations/admin.validation.js";

const SETTINGS_ID = "singleton";

/**
 * Reads settings, creating the singleton if it is somehow absent.
 *
 * upsert rather than findUnique + throw: the customer menu reads tax rates on
 * every order, and a missing settings row must not take ordering down.
 */
export const getSettings = async () => {
  return prisma.restaurantSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
};

/**
 * Public subset, served to the customer app.
 *
 * Excludes internal contact details and operational flags the diner has no
 * business seeing.
 */
export const getPublicSettings = async () => {
  const settings = await getSettings();

  return {
    name: settings.name,
    tagline: settings.tagline,
    logoUrl: settings.logoUrl,
    currency: settings.currency,
    taxPercent: settings.taxPercent.toString(),
    serviceChargePercent: settings.serviceChargePercent.toString(),
    isAcceptingOrders: settings.isAcceptingOrders,
    openingTime: settings.openingTime,
    closingTime: settings.closingTime,
    address: [settings.addressLine, settings.city, settings.state, settings.postalCode]
      .filter(Boolean)
      .join(", "),
    phone: settings.phone,
  };
};

export const updateSettings = async (input: UpdateSettingsInput) => {
  // Ensures the row exists before updating it.
  await getSettings();

  return prisma.restaurantSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      ...input,
      // Currency codes are conventionally uppercase (INR, USD).
      ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
    },
  });
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const listCustomers = async (
  query: CustomerListQuery
): Promise<{ customers: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.CustomerWhereInput = query.search
    ? {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: "insensitive" } },
        ],
      }
    : {};

  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    }),
    prisma.customer.count({ where }),
  ]);

  return { customers, meta: buildPaginationMeta(pagination, total) };
};

/** A customer with their order history. */
export const getCustomerById = async (id: string) => {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { placedAt: "desc" },
        // Bounded: a regular's history could otherwise be thousands of rows.
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          placedAt: true,
        },
      },
      _count: { select: { orders: true } },
    },
  });

  if (!customer) {
    throw AppError.notFound("Customer not found");
  }

  return customer;
};

export const updateCustomer = async (id: string, input: UpdateCustomerInput) => {
  await getCustomerById(id);

  if (input.phone) {
    const clash = await prisma.customer.findFirst({
      where: { phone: input.phone, id: { not: id } },
      select: { id: true },
    });

    if (clash) {
      throw AppError.conflict("Another customer already uses this phone number");
    }
  }

  return prisma.customer.update({ where: { id }, data: input });
};
