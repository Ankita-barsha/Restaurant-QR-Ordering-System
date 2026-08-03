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
 * GET /api/settings is UNAUTHENTICATED — it has to be, a diner who scanned a
 * QR code has no account. So this function is the boundary: whatever it
 * returns is world-readable.
 *
 * The gateway SECRETS are therefore absent, and must stay absent. They were
 * once returned here, which published the Razorpay key secret to every diner
 * who opened the menu; anyone holding it can charge cards in the restaurant's
 * name and forge webhook events. The publishable key id is fine — that is what
 * it is for — but it is only handed out with a payment intent, so a page that
 * is not paying for anything never carries it at all.
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
    bankingName: settings.bankingName ?? settings.name,
    merchantVpa: settings.merchantVpa ?? "bitemebistro@upi",
    // Shown on the diner's own invoice, so it stays.
    bankAccountNo: settings.bankAccountNo,
    bankIfscCode: settings.bankIfscCode,
    paymentGatewayProvider: settings.paymentGatewayProvider ?? "RAZORPAY",
    /**
     * Whether real money is being taken.
     *
     * A boolean, never the credentials that make it true. The customer app
     * needs this to decide whether to open the gateway's own checkout or the
     * demo one, and a diner is entitled to know which of the two they are
     * looking at before they type a UPI ID into it.
     */
    gatewayIsLive: Boolean(
      settings.paymentGatewayProvider === "RAZORPAY" &&
        settings.razorpayKeyId &&
        settings.razorpayKeySecret
    ),

    /**
     * What the advance-payment dialog needs to explain itself.
     *
     * The percentage and the message are shown to the guest, so they are
     * public by definition. The THRESHOLD is not here on purpose: publishing
     * it tells anyone probing the system exactly what to stay under, and the
     * guest never needs the number — they are only ever told the outcome, and
     * only once their own balance has crossed it.
     */
    advancePaymentPercent: settings.advancePaymentPercent.toString(),
    advancePaymentMessage: settings.advancePaymentMessage,
    allowCashAdvance: settings.allowCashAdvance,
    allowOnlineAdvance: settings.allowOnlineAdvance,
    // razorpayKeyId, razorpayKeySecret, razorpayWebhookSecret and
    // paytmMerchantId are deliberately NOT here. See the note above.
  };
};

/** Field names that must never be echoed back once stored. */
const SECRET_SETTINGS = ["razorpayKeySecret", "razorpayWebhookSecret"] as const;

/**
 * Settings for the admin screens, with the secrets masked.
 *
 * Write-only by design: an administrator sets a key and afterwards sees only
 * whether one is present. Rendering a stored secret back into an input box
 * puts it in the DOM, in the browser's memory, in any screen recording of the
 * settings page and in the response body of an endpoint that merely reads
 * settings — for no benefit, because nobody needs to re-read a key they
 * already pasted from the Razorpay dashboard.
 */
export const getAdminSettings = async () => {
  const settings = await getSettings();

  const masked = Object.fromEntries(
    SECRET_SETTINGS.map((field) => [
      // The screen shows "configured" or "not set" from this boolean; the
      // value itself never crosses the wire.
      `${field}IsSet`,
      Boolean(settings[field]),
    ])
  );

  const visible = { ...settings } as Record<string, unknown>;

  for (const field of SECRET_SETTINGS) {
    delete visible[field];
  }

  return { ...visible, ...masked };
};

export const updateSettings = async (input: UpdateSettingsInput) => {
  // Ensures the row exists before updating it.
  await getSettings();

  const data: Record<string, unknown> = {
    ...input,
    // Currency codes are conventionally uppercase (INR, USD).
    ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
  };

  /**
   * An empty secret means "leave it alone", not "erase it".
   *
   * The admin form cannot show a stored secret — see getAdminSettings — so it
   * necessarily submits an empty box for a key that is already configured.
   * Writing that through would clear the credential every time anyone saved
   * an unrelated field, and the restaurant would silently drop back to the
   * demo gateway mid-service.
   */
  for (const field of SECRET_SETTINGS) {
    if (data[field] === "" || data[field] === undefined) {
      delete data[field];
    }
  }

  await prisma.restaurantSettings.update({ where: { id: SETTINGS_ID }, data });

  // Masked on the way back out, for the same reason it is masked on read: the
  // response to a save is as readable as the response to a fetch.
  return getAdminSettings();
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
