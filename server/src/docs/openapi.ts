/**
 * The OpenAPI 3.1 description of this API.
 *
 * Request shapes come from the Zod schemas the server actually validates with
 * (see ./schema.ts), so they cannot drift from the code. What is written by
 * hand here is the part Zod does not know: what each endpoint is FOR, who may
 * call it, and what it gives back.
 *
 * Every protected operation names the permission it requires. That is the same
 * information the route files carry, and it is the first thing anyone
 * integrating with this API needs to know.
 */

import { z } from "zod";

import { PERMISSIONS } from "../config/permissions.js";
import {
  jsonBody,
  multipartBody,
  toOpenApiSchema,
  toParameters,
  type JsonSchema,
} from "./schema.js";

import { loginSchema, refreshSchema } from "../validations/auth.validation.js";
import {
  auditListQuerySchema,
  createRoleSchema,
  createUserSchema,
  customerListQuerySchema,
  reportQuerySchema,
  resetPasswordSchema,
  revenuePeriodSchema,
  setRolePermissionsSchema,
  updateCustomerSchema,
  updateRoleSchema,
  updateSettingsSchema,
  updateUserSchema,
  userListQuerySchema,
} from "../validations/admin.validation.js";
import {
  createCategorySchema,
  listQuerySchema as categoryListQuerySchema,
  updateCategorySchema,
} from "../validations/category.validation.js";
import {
  availabilitySchema,
  createFoodSchema,
  foodListQuerySchema,
  updateFoodSchema,
} from "../validations/food.validation.js";
import {
  addItemsSchema,
  cancelOrderSchema,
  orderListQuerySchema,
  placeOrderSchema,
  serveOrderSchema,
  updatePaymentSchema,
  updateStatusSchema,
} from "../validations/order.validation.js";
import {
  cashPaymentSchema,
  confirmPaymentSchema,
  initiatePaymentSchema,
  paymentListQuerySchema,
  refundPaymentSchema,
} from "../validations/payment.validation.js";
import {
  availabilityQuerySchema,
  createReservationSchema,
  reservationListQuerySchema,
  reservationStatusUpdateSchema,
  updateReservationSchema,
} from "../validations/reservation.validation.js";
import {
  createTableSchema,
  tableListQuerySchema,
  updateTableSchema,
} from "../validations/table.validation.js";
import { booleanish } from "../validations/common.validation.js";

// ---------------------------------------------------------------------------
// Reusable pieces
// ---------------------------------------------------------------------------

const idParam: JsonSchema = {
  name: "id",
  in: "path",
  required: true,
  description: "The record's cuid.",
  schema: { type: "string", examples: ["cms2vp78n000bhgijxwcjznf3"] },
};

const slugParam: JsonSchema = {
  name: "slug",
  in: "path",
  required: true,
  description: "URL-safe identifier, e.g. `margherita-pizza`.",
  schema: { type: "string" },
};

/** References a component schema. */
const ref = (name: string): JsonSchema => ({ $ref: `#/components/schemas/${name}` });

/** A JSON response with a description. */
const json = (description: string, schema: JsonSchema): JsonSchema => ({
  description,
  content: { "application/json": { schema } },
});

/**
 * The success envelope every endpoint returns.
 *
 * `data` is left loosely typed on most operations deliberately. The response
 * bodies are Prisma rows whose exact shape belongs to the database schema; the
 * models below document the ones a caller actually builds against, and pinning
 * every last include would be a second source of truth to keep in step.
 */
const ok = (description: string, data?: JsonSchema): JsonSchema =>
  json(description, {
    type: "object",
    properties: {
      success: { type: "boolean", const: true },
      message: { type: "string" },
      ...(data ? { data } : { data: {} }),
    },
    required: ["success"],
  });

/** A paginated list envelope. */
const okList = (description: string, item: JsonSchema): JsonSchema =>
  json(description, {
    type: "object",
    properties: {
      success: { type: "boolean", const: true },
      data: { type: "array", items: item },
      meta: ref("PaginationMeta"),
    },
    required: ["success", "data"],
  });

const errorResponse = (description: string): JsonSchema =>
  json(description, ref("Error"));

/** Responses shared by everything behind `authenticate`. */
const authErrors = {
  401: errorResponse("No access token, or it has expired."),
  403: errorResponse("Authenticated, but the account lacks the permission."),
};

const validationError = {
  400: errorResponse("Validation failed. `details` lists the offending fields."),
};

const rateLimited = {
  429: errorResponse("Rate limit exceeded. Wait and retry."),
};

const notFound = { 404: errorResponse("No such record.") };

interface OperationInput {
  tag: string;
  summary: string;
  description: string;
  /** Permission key required, or "authenticated" for any signed-in staff. */
  permission?: string | string[] | "authenticated";
  parameters?: JsonSchema[];
  requestBody?: JsonSchema;
  responses: Record<string, JsonSchema>;
  operationId: string;
  /** Set when the endpoint carries its own stricter rate limit. */
  limit?: "public-write" | "public-lookup" | "auth";
  /** Overrides the security derived from `permission`, e.g. cookie auth. */
  security?: JsonSchema[];
}

const LIMIT_NOTE: Record<NonNullable<OperationInput["limit"]>, string> = {
  "public-write":
    "**Rate limit:** 20 requests / 10 minutes per IP. This endpoint is unauthenticated and writes, so the limiter is the only thing between it and an abusive script.",
  "public-lookup":
    "**Rate limit:** 60 requests / 5 minutes per IP, to blunt enumeration of order numbers and booking references.",
  auth: "**Rate limit:** 10 failed attempts / 15 minutes per IP + email. Successful sign-ins are not counted.",
};

/**
 * Builds one operation, folding the access rule into the description so it is
 * visible in Swagger UI without cross-referencing the route files.
 */
const operation = (input: OperationInput): JsonSchema => {
  const parts = [input.description];

  if (input.permission === "authenticated") {
    parts.push("**Access:** any signed-in staff member.");
  } else if (Array.isArray(input.permission)) {
    parts.push(
      `**Access:** requires \`${input.permission.join("\` or \`")}\`.`
    );
  } else if (input.permission) {
    parts.push(`**Access:** requires \`${input.permission}\`.`);
  } else {
    parts.push("**Access:** public — no authentication.");
  }

  if (input.limit) {
    parts.push(LIMIT_NOTE[input.limit]);
  }

  const security =
    input.security ?? (input.permission ? [{ bearerAuth: [] }] : []);

  return {
    tags: [input.tag],
    operationId: input.operationId,
    summary: input.summary,
    description: parts.join("\n\n"),
    security,
    ...(input.parameters?.length ? { parameters: input.parameters } : {}),
    ...(input.requestBody ? { requestBody: input.requestBody } : {}),
    responses: {
      ...input.responses,
      ...(input.permission ? authErrors : {}),
      /**
       * Every /api route passes through the general limiter (300 requests a
       * minute), so any of them can answer 429 — including the ones with no
       * other failure mode. Declared last so an endpoint's own stricter
       * limit description, set above, is not overwritten.
       */
      429: input.responses[429] ?? rateLimited[429],
    },
  };
};

// ---------------------------------------------------------------------------
// Component models
//
// Response shapes a caller builds against. Written out rather than derived,
// because they describe what the database returns, not what Zod validates.
// ---------------------------------------------------------------------------

const money = (description: string): JsonSchema => ({
  type: "string",
  description: `${description} Exact decimal STRING, never a float — see the money note in the README.`,
  examples: ["349.00"],
});

const components: Record<string, JsonSchema> = {
  Error: {
    type: "object",
    description: "The shape returned for every failed request, without exception.",
    properties: {
      success: { type: "boolean", const: false },
      message: { type: "string", examples: ["Order not found"] },
      details: {
        type: "array",
        description: "Present on validation failures: which field failed and why.",
        items: {
          type: "object",
          properties: {
            field: { type: "string", examples: ["paymentMethod"] },
            message: { type: "string", examples: ["Tell us how the customer paid"] },
          },
        },
      },
      stack: {
        type: "string",
        description: "Development only. Never sent in production.",
      },
    },
    required: ["success", "message"],
  },

  PaginationMeta: {
    type: "object",
    properties: {
      page: { type: "integer", examples: [1] },
      limit: { type: "integer", examples: [20] },
      total: { type: "integer", examples: [137] },
      totalPages: { type: "integer", examples: [7] },
      hasNextPage: { type: "boolean" },
      hasPreviousPage: { type: "boolean" },
    },
  },

  Category: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string", examples: ["Pizza"] },
      slug: { type: "string", examples: ["pizza"] },
      description: { type: ["string", "null"] },
      imageUrl: { type: ["string", "null"] },
      sortOrder: { type: "integer", description: "Manual order; menus are not alphabetical." },
      isActive: { type: "boolean" },
    },
  },

  Food: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string", examples: ["Chicken Biryani"] },
      slug: { type: "string" },
      description: { type: ["string", "null"] },
      price: money("Unit price."),
      imageUrl: { type: ["string", "null"], description: "Server-relative, e.g. `/uploads/abc.jpg`." },
      isAvailable: { type: "boolean" },
      isVegetarian: { type: "boolean" },
      preparationMinutes: { type: ["integer", "null"] },
      categoryId: { type: "string" },
    },
  },

  OrderItem: {
    type: "object",
    description:
      "A line on an order. foodName and unitPrice are SNAPSHOTS taken at purchase time, so later menu edits cannot rewrite what the customer was charged.",
    properties: {
      id: { type: "string" },
      foodId: { type: "string" },
      foodName: { type: "string" },
      unitPrice: money("Price at the moment of purchase."),
      quantity: { type: "integer" },
      lineTotal: money("unitPrice × quantity."),
      notes: { type: ["string", "null"], examples: ["no onions"] },
    },
  },

  Order: {
    type: "object",
    properties: {
      id: { type: "string" },
      orderNumber: { type: "string", examples: ["ORD-000045"] },
      trackingToken: {
        type: "string",
        description:
          "Unguessable token that authorises tracking and payment for this order. Handed to the diner exactly once, here — there is no endpoint that returns it again. Keep it: it is the only way back to the order.",
      },
      verificationCode: {
        type: ["string", "null"],
        description:
          "Four-character pickup code shown ONLY to the customer. The waiter must enter it to serve the order, which stops food reaching the wrong table.",
        examples: ["K7MA"],
      },
      status: {
        type: "string",
        enum: ["PENDING", "CONFIRMED", "PREPARING", "READY", "SERVED", "CANCELLED"],
      },
      type: { type: "string", enum: ["DINE_IN", "TAKEAWAY"] },
      paymentStatus: { type: "string", enum: ["UNPAID", "PAID", "REFUNDED"] },
      paymentMethod: { type: ["string", "null"], enum: ["CASH", "CARD", "UPI", "ONLINE", null] },
      subtotal: money("Sum of the line totals."),
      taxAmount: money("Tax and service charge combined, as the receipt reads."),
      discountAmount: money("Discount applied."),
      totalAmount: money("What the customer pays."),
      notes: { type: ["string", "null"] },
      items: { type: "array", items: ref("OrderItem") },
      table: {
        type: ["object", "null"],
        properties: { id: { type: "string" }, tableNumber: { type: "string" } },
      },
      customer: {
        type: ["object", "null"],
        properties: {
          id: { type: "string" },
          name: { type: ["string", "null"] },
          phone: { type: ["string", "null"] },
        },
      },
      handledBy: {
        type: ["object", "null"],
        description:
          "The staff member who FIRST acted on the order. Not overwritten by later transitions, so an order stays credited to whoever accepted it.",
        properties: { id: { type: "string" }, fullName: { type: "string" } },
      },
      placedAt: { type: "string", format: "date-time" },
      confirmedAt: { type: ["string", "null"], format: "date-time" },
      preparedAt: { type: ["string", "null"], format: "date-time" },
      readyAt: { type: ["string", "null"], format: "date-time" },
      servedAt: { type: ["string", "null"], format: "date-time" },
      cancelledAt: { type: ["string", "null"], format: "date-time" },
      cancelReason: { type: ["string", "null"] },
    },
  },

  TrackedOrder: {
    type: "object",
    description:
      "The trimmed view returned to a diner tracking their own order: no staff details and no other customer's contact information.",
    properties: {
      orderNumber: { type: "string" },
      trackingToken: {
        type: "string",
        description:
          "Echoed back so the screen can subscribe to updates and start a payment without re-reading it from the URL.",
      },
      verificationCode: {
        type: ["string", "null"],
        description:
          "The pickup code. Safe to return here precisely because reaching this order required the unguessable token.",
      },
      status: { type: "string" },
      type: { type: "string" },
      paymentStatus: { type: "string" },
      totalAmount: money("What the customer pays."),
      placedAt: { type: "string", format: "date-time" },
      table: {
        type: ["object", "null"],
        properties: { tableNumber: { type: "string" } },
      },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            foodName: { type: "string" },
            quantity: { type: "integer" },
            lineTotal: money("Line total."),
            notes: { type: ["string", "null"] },
          },
        },
      },
    },
  },

  Table: {
    type: "object",
    properties: {
      id: { type: "string" },
      tableNumber: { type: "string", examples: ["T-01"] },
      capacity: { type: "integer" },
      status: { type: "string", enum: ["AVAILABLE", "OCCUPIED", "RESERVED", "INACTIVE"] },
      qrToken: {
        type: "string",
        description:
          "Unguessable token embedded in the QR URL. Separate from `id` so a code can be rotated after a leak without touching historical orders.",
      },
      qrImageUrl: { type: ["string", "null"] },
      isActive: { type: "boolean" },
    },
  },

  ScannedTable: {
    type: "object",
    description: "What a diner learns by scanning a QR code — no token is echoed back.",
    properties: {
      id: { type: "string" },
      tableNumber: { type: "string" },
      capacity: { type: "integer" },
      status: { type: "string" },
    },
  },

  Reservation: {
    type: "object",
    properties: {
      id: { type: "string" },
      reference: {
        type: "string",
        description: "Short code the guest quotes on arrival.",
        examples: ["R-ZDXWJ5"],
      },
      name: { type: "string" },
      phone: { type: "string" },
      email: { type: ["string", "null"] },
      partySize: { type: "integer" },
      reservedAt: { type: "string", format: "date-time" },
      durationMinutes: { type: "integer" },
      status: {
        type: "string",
        enum: ["PENDING", "CONFIRMED", "SEATED", "COMPLETED", "CANCELLED", "NO_SHOW"],
      },
      occasion: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      table: { type: ["object", "null"] },
    },
  },

  Payment: {
    type: "object",
    description:
      "One payment attempt against an order. The Payment rows are the LEDGER; Order.paymentStatus is only their summary. A refund reverses the row in place rather than inserting a negative one, so 'collected' stays a plain sum over SUCCESS.",
    properties: {
      id: { type: "string" },
      receiptNumber: { type: ["string", "null"], examples: ["RCPT-37DA9602"] },
      amount: money("Amount captured."),
      method: { type: "string", enum: ["CASH", "CARD", "UPI", "ONLINE"] },
      status: { type: "string", enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"] },
      provider: {
        type: "string",
        description:
          "Who processed it: `mock` for the built-in demo gateway, `cash` or `manual` for money taken by hand, a gateway name once real keys are configured.",
      },
      refundedAt: { type: ["string", "null"], format: "date-time" },
      refundReason: { type: ["string", "null"] },
      paidAt: { type: ["string", "null"], format: "date-time" },
      createdAt: { type: "string", format: "date-time" },
      order: { type: ["object", "null"], properties: { orderNumber: { type: "string" } } },
    },
  },

  AuthUser: {
    type: "object",
    properties: {
      id: { type: "string" },
      email: { type: "string", format: "email" },
      fullName: { type: "string" },
      role: {
        type: "object",
        properties: { id: { type: "string" }, name: { type: "string", examples: ["ADMIN"] } },
      },
      permissions: {
        type: "array",
        items: { type: "string", examples: ["order:read"] },
        description: "Empty for SUPER_ADMIN, which bypasses permission checks entirely.",
      },
    },
  },

  PublicSettings: {
    type: "object",
    description: "The subset of restaurant settings the customer app may see.",
    properties: {
      name: { type: "string" },
      tagline: { type: ["string", "null"] },
      logoUrl: { type: ["string", "null"] },
      currency: { type: "string", examples: ["INR"] },
      taxPercent: { type: "string", examples: ["8.50"] },
      serviceChargePercent: {
        type: "string",
        description:
          "Applied to the SUBTOTAL alongside tax, never compounded on it. A client quoting a total must include this.",
        examples: ["10.00"],
      },
      isAcceptingOrders: { type: "boolean" },
      openingTime: { type: ["string", "null"], examples: ["09:30"] },
      closingTime: { type: ["string", "null"] },
      address: { type: "string" },
      phone: { type: ["string", "null"] },
    },
  },

  DashboardSummary: {
    type: "object",
    properties: {
      today: {
        type: "object",
        description:
          "The trading day in the restaurant's own timezone — the same boundary the sales chart buckets on, so the two always describe the same orders.",
        properties: {
          date: { type: "string", examples: ["2026-07-27"] },
          timezone: { type: "string", examples: ["Asia/Kolkata"] },
          revenue: money("Taken today."),
          orders: { type: "integer" },
          averageOrderValue: money("Revenue ÷ orders."),
        },
      },
      live: {
        type: "object",
        properties: {
          openOrders: { type: "integer" },
          pending: { type: "integer" },
          preparing: { type: "integer" },
          ready: { type: "integer" },
        },
      },
      tables: {
        type: "object",
        properties: {
          total: { type: "integer" },
          occupied: { type: "integer" },
          free: { type: "integer" },
        },
      },
      menu: {
        type: "object",
        properties: { total: { type: "integer" }, soldOut: { type: "integer" } },
      },
      customers: { type: "integer" },
    },
  },

  KitchenQueue: {
    type: "object",
    description:
      "Unpaginated by design: the display shows every open order at once, and the set is bounded by what a kitchen can hold.",
    properties: {
      pending: { type: "array", items: ref("Order") },
      confirmed: { type: "array", items: ref("Order") },
      preparing: { type: "array", items: ref("Order") },
      ready: { type: "array", items: ref("Order") },
      total: { type: "integer" },
    },
  },
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const paths: Record<string, Record<string, JsonSchema>> = {
  // ---- Meta -------------------------------------------------------------
  "/health": {
    get: operation({
      tag: "Meta",
      operationId: "health",
      summary: "Liveness probe",
      description: "Returns 200 while the process is serving. Used by uptime checks.",
      responses: { 200: ok("The API is up.") },
    }),
  },

  "/settings": {
    get: operation({
      tag: "Meta",
      operationId: "getPublicSettings",
      summary: "Restaurant name, currency and charges",
      description:
        "Everything the customer app needs to render a menu and quote a bill. **A client computing a total must apply BOTH `taxPercent` and `serviceChargePercent` to the subtotal** — the server does, and a quote that omits either will under-charge the diner on screen.",
      responses: { 200: ok("Public settings.", ref("PublicSettings")) },
    }),
  },

  // ---- Auth -------------------------------------------------------------
  "/auth/login": {
    post: operation({
      tag: "Auth",
      operationId: "login",
      summary: "Sign in",
      description:
        "Returns a short-lived access token in the body and sets the refresh token as an httpOnly cookie scoped to `/api/auth`. The refresh token is deliberately NOT in the body: a token JavaScript can read is a token an XSS bug can steal.",
      limit: "auth",
      requestBody: jsonBody(loginSchema),
      responses: {
        200: ok("Signed in. Sets the `refreshToken` cookie.", {
          type: "object",
          properties: { user: ref("AuthUser"), accessToken: { type: "string" } },
        }),
        401: errorResponse("Wrong email or password."),
        ...validationError,
        ...rateLimited,
      },
    }),
  },

  "/auth/refresh": {
    post: operation({
      tag: "Auth",
      operationId: "refresh",
      summary: "Mint a new access token",
      description:
        "Reads the refresh token from the httpOnly cookie, falling back to the body for clients with no cookie jar (a mobile app, a script). **A browser sends no body at all** — the token is in a cookie it cannot read — and that is a valid request.",
      limit: "auth",
      // The credential is the cookie, not a bearer token — this is the call
      // made precisely when no valid access token is left.
      security: [{ refreshCookie: [] }],
      requestBody: {
        required: false,
        description: "Omit entirely when relying on the cookie.",
        content: { "application/json": { schema: toOpenApiSchema(refreshSchema) } },
      },
      responses: {
        200: ok("A fresh access token.", {
          type: "object",
          properties: { accessToken: { type: "string" } },
        }),
        401: errorResponse("No refresh token, or it was revoked or has expired."),
        ...rateLimited,
      },
    }),
  },

  "/auth/logout": {
    post: operation({
      tag: "Auth",
      operationId: "logout",
      summary: "Sign out of this session",
      description:
        "Revokes the refresh token in the database and clears the cookie. Identified by the cookie, so it works even once the access token has expired.",
      security: [{ refreshCookie: [] }],
      responses: { 200: ok("Signed out.") },
    }),
  },

  "/auth/logout-all": {
    post: operation({
      tag: "Auth",
      operationId: "logoutAll",
      summary: "Sign out everywhere",
      description:
        "Revokes every refresh token for the account. Refresh tokens are stored precisely so this is possible — a pure JWT cannot be cancelled.",
      permission: "authenticated",
      responses: { 200: ok("All sessions revoked.") },
    }),
  },

  "/auth/me": {
    get: operation({
      tag: "Auth",
      operationId: "me",
      summary: "The signed-in staff member",
      description: "Identity, role and the resolved permission list the UI gates on.",
      permission: "authenticated",
      responses: { 200: ok("The current user.", { type: "object", properties: { user: ref("AuthUser") } }) },
    }),
  },

  // ---- Categories -------------------------------------------------------
  "/categories": {
    get: operation({
      tag: "Menu",
      operationId: "listCategories",
      summary: "List categories",
      description: "Public. Returns only active, non-deleted categories unless `includeInactive` is set by a signed-in caller.",
      parameters: toParameters(categoryListQuerySchema, "query"),
      responses: { 200: okList("Categories.", ref("Category")), ...validationError },
    }),
    post: operation({
      tag: "Menu",
      operationId: "createCategory",
      summary: "Create a category",
      description: "The slug is derived from the name and de-duplicated automatically.",
      permission: PERMISSIONS.CATEGORY_CREATE,
      requestBody: jsonBody(createCategorySchema),
      responses: { 201: ok("Created.", ref("Category")), ...validationError, 409: errorResponse("That name is already taken.") },
    }),
  },

  "/categories/slug/{slug}": {
    get: operation({
      tag: "Menu",
      operationId: "getCategoryBySlug",
      summary: "Fetch a category by slug",
      description: "Public. How the customer menu filters without knowing ids.",
      parameters: [slugParam],
      responses: { 200: ok("The category.", ref("Category")), ...notFound },
    }),
  },

  "/categories/{id}": {
    get: operation({
      tag: "Menu",
      operationId: "getCategory",
      summary: "Fetch a category",
      description: "Includes inactive and soft-deleted rows, which the public list hides.",
      permission: PERMISSIONS.CATEGORY_READ,
      parameters: [idParam],
      responses: { 200: ok("The category.", ref("Category")), ...notFound },
    }),
    patch: operation({
      tag: "Menu",
      operationId: "updateCategory",
      summary: "Edit a category",
      description: "Any subset of the create fields. An empty body is rejected — a PATCH with nothing to change is a client bug worth surfacing.",
      permission: PERMISSIONS.CATEGORY_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(updateCategorySchema),
      responses: { 200: ok("Updated.", ref("Category")), ...validationError, ...notFound },
    }),
    delete: operation({
      tag: "Menu",
      operationId: "deleteCategory",
      summary: "Delete a category",
      description: "Soft delete. Refused while dishes still reference it, so historical orders keep resolving.",
      permission: PERMISSIONS.CATEGORY_DELETE,
      parameters: [idParam],
      responses: { 200: ok("Deleted."), ...notFound, 409: errorResponse("Still holds dishes.") },
    }),
  },

  // ---- Foods ------------------------------------------------------------
  "/foods": {
    get: operation({
      tag: "Menu",
      operationId: "listFoods",
      summary: "Browse the menu",
      description: "Public. Search, category filter, vegetarian filter and sorting.",
      parameters: toParameters(foodListQuerySchema, "query"),
      responses: { 200: okList("Menu items.", ref("Food")), ...validationError },
    }),
    post: operation({
      tag: "Menu",
      operationId: "createFood",
      summary: "Add a dish",
      description:
        "`multipart/form-data`, because it carries the photo. Every text field therefore arrives as a string — which is why numbers are coerced and booleans accept `\"true\"`/`\"false\"` rather than using `Boolean()`, since `Boolean(\"false\")` is `true`. The upload's BYTES are checked, not just its filename.",
      permission: PERMISSIONS.FOOD_CREATE,
      requestBody: multipartBody(createFoodSchema, {
        field: "image",
        description: "Dish photo. JPEG, PNG or WebP, within the configured size cap.",
      }),
      responses: { 201: ok("Created.", ref("Food")), ...validationError, 413: errorResponse("Image is too large.") },
    }),
  },

  "/foods/slug/{slug}": {
    get: operation({
      tag: "Menu",
      operationId: "getFoodBySlug",
      summary: "Fetch a dish by slug",
      description: "Public. Used by the customer menu's dish sheet.",
      parameters: [slugParam],
      responses: { 200: ok("The dish.", ref("Food")), ...notFound },
    }),
  },

  "/foods/{id}": {
    get: operation({
      tag: "Menu",
      operationId: "getFood",
      summary: "Fetch a dish",
      description: "Staff view; includes unavailable and soft-deleted rows.",
      permission: PERMISSIONS.FOOD_READ,
      parameters: [idParam],
      responses: { 200: ok("The dish.", ref("Food")), ...notFound },
    }),
    patch: operation({
      tag: "Menu",
      operationId: "updateFood",
      summary: "Edit a dish",
      description:
        "`multipart/form-data`. Omitting `image` leaves the existing photo untouched. Editing a price does NOT change what past orders were charged — order lines hold their own snapshot.",
      permission: PERMISSIONS.FOOD_UPDATE,
      parameters: [idParam],
      requestBody: multipartBody(updateFoodSchema, {
        field: "image",
        description: "Replacement photo. Omit to keep the current one.",
      }),
      responses: { 200: ok("Updated.", ref("Food")), ...validationError, ...notFound },
    }),
    delete: operation({
      tag: "Menu",
      operationId: "deleteFood",
      summary: "Delete a dish",
      description: "Soft delete, so orders that contain it still read correctly.",
      permission: PERMISSIONS.FOOD_DELETE,
      parameters: [idParam],
      responses: { 200: ok("Deleted."), ...notFound },
    }),
  },

  "/foods/{id}/availability": {
    patch: operation({
      tag: "Menu",
      operationId: "setFoodAvailability",
      summary: "Mark a dish sold out or back on",
      description:
        "Its own endpoint behind the READ permission on purpose: kitchen and waiting staff must be able to 86 a dish mid-service without holding the rights that let them change prices. Broadcast over Socket.IO so open menus grey the item out immediately.",
      permission: PERMISSIONS.FOOD_READ,
      parameters: [idParam],
      requestBody: jsonBody(availabilitySchema),
      responses: { 200: ok("Availability changed.", ref("Food")), ...validationError, ...notFound },
    }),
  },

  // ---- Orders -----------------------------------------------------------
  "/orders": {
    get: operation({
      tag: "Orders",
      operationId: "listOrders",
      summary: "List orders",
      description: "Paginated and filterable by status, type, table, order number and date range.",
      permission: PERMISSIONS.ORDER_READ,
      parameters: toParameters(orderListQuerySchema, "query"),
      responses: { 200: okList("Orders.", ref("Order")), ...validationError },
    }),
    post: operation({
      tag: "Orders",
      operationId: "placeOrder",
      summary: "Place an order",
      description:
        "Public — the diner who scanned the QR code has no account.\n\n**The request carries no prices.** It sends food ids and quantities; the server resolves every price, re-checks availability and computes tax and service charge inside one transaction. A tampered cart changes nothing about the bill.\n\nThe table is identified by its `qrToken`, never by a client-supplied id, so nobody can order against a table they did not scan.",
      limit: "public-write",
      requestBody: jsonBody(placeOrderSchema),
      responses: {
        201: ok("Placed. Includes the pickup code to show the waiter.", ref("Order")),
        ...validationError,
        409: errorResponse("An item sold out, or the restaurant is not accepting orders."),
        ...rateLimited,
      },
    }),
  },

  "/orders/track/{token}": {
    get: operation({
      tag: "Orders",
      operationId: "trackOrder",
      summary: "Track an order",
      description:
        "Public, authorised by possession of the order's `trackingToken` — issued exactly once, in the response to placing the order.\n\nDeliberately NOT keyed on the order number: that is a sequence value, so anyone counting upwards could read every order and its pickup code. Returns a trimmed view — no staff details, no other customer's contact information.",
      limit: "public-lookup",
      parameters: [
        {
          name: "token",
          in: "path",
          required: true,
          description: "The `trackingToken` returned when the order was placed.",
          schema: { type: "string", minLength: 32 },
        },
      ],
      responses: {
        200: ok("Live status.", ref("TrackedOrder")),
        ...validationError,
        ...notFound,
        ...rateLimited,
      },
    }),
  },

  "/orders/kitchen": {
    get: operation({
      tag: "Orders",
      operationId: "kitchenQueue",
      summary: "The Kitchen Display queue",
      description:
        "Every open order, grouped into the display's columns and oldest first — the order they must be cooked in. Each carries `estimatedMinutes`, the slowest dish on the ticket, which drives the countdown.",
      permission: [PERMISSIONS.KITCHEN_ACCESS, PERMISSIONS.ORDER_READ],
      responses: { 200: ok("The live queue.", ref("KitchenQueue")) },
    }),
  },

  "/orders/{id}": {
    get: operation({
      tag: "Orders",
      operationId: "getOrder",
      summary: "Fetch an order",
      description: "The full staff view, including items, table, customer and who handled it.",
      permission: PERMISSIONS.ORDER_READ,
      parameters: [idParam],
      responses: { 200: ok("The order.", ref("Order")), ...notFound },
    }),
  },

  "/orders/{id}/items": {
    post: operation({
      tag: "Orders",
      operationId: "addOrderItems",
      summary: "Add to a running tab",
      description:
        "\"And another naan.\" Permitted only while PENDING or CONFIRMED — once the kitchen is PREPARING, the bill must stop moving, otherwise a total changes after the food has started cooking. Totals are recomputed from the lines themselves, not from the stored subtotal.",
      permission: PERMISSIONS.ORDER_CREATE,
      parameters: [idParam],
      requestBody: jsonBody(addItemsSchema),
      responses: {
        200: ok("Items added; totals recalculated.", ref("Order")),
        ...validationError,
        ...notFound,
        409: errorResponse("The order has moved past the editable stage."),
      },
    }),
  },

  "/orders/{id}/status": {
    patch: operation({
      tag: "Orders",
      operationId: "updateOrderStatus",
      summary: "Advance an order",
      description:
        "Moves the order through `PENDING → CONFIRMED → PREPARING → READY → SERVED`, with `CANCELLED` reachable from any live state. Illegal transitions are REJECTED, not merely hidden by the UI, and SERVED and CANCELLED are terminal.\n\nThe first staff member to act is recorded as `handledBy` and is not overwritten by later transitions.",
      permission: PERMISSIONS.ORDER_UPDATE_STATUS,
      parameters: [idParam],
      requestBody: jsonBody(updateStatusSchema),
      responses: {
        200: ok("Status changed.", ref("Order")),
        ...validationError,
        ...notFound,
        409: errorResponse("That transition is not legal from the current status."),
      },
    }),
  },

  "/orders/{id}/serve": {
    post: operation({
      tag: "Orders",
      operationId: "serveOrder",
      summary: "Serve, after verifying the pickup code",
      description:
        "The waiter asks the diner for their four-character code and enters it here. The order only reaches SERVED if it matches — this is what stops food being handed to the wrong table. Compared case-insensitively, because the code is spoken aloud and re-typed. Orders placed before this feature have no code and are allowed through.",
      permission: PERMISSIONS.ORDER_UPDATE_STATUS,
      parameters: [idParam],
      requestBody: jsonBody(serveOrderSchema),
      responses: {
        200: ok("Served.", ref("Order")),
        400: errorResponse("The code does not match this order."),
        ...notFound,
        409: errorResponse("The order is not READY."),
      },
    }),
  },

  "/orders/{id}/cancel": {
    post: operation({
      tag: "Orders",
      operationId: "cancelOrder",
      summary: "Cancel an order",
      description:
        "Its own permission: waiting staff advance orders, but voiding one is a financial act reserved for managers. The reason is mandatory and is written in the same transaction as the status, so an order is never cancelled without an explanation.",
      permission: PERMISSIONS.ORDER_CANCEL,
      parameters: [idParam],
      requestBody: jsonBody(cancelOrderSchema),
      responses: {
        200: ok("Cancelled.", ref("Order")),
        ...validationError,
        ...notFound,
        409: errorResponse("Already served or already cancelled."),
      },
    }),
  },

  "/orders/{id}/payment": {
    patch: operation({
      tag: "Payments",
      operationId: "settleOrderPayment",
      summary: "Settle an order at the table",
      description:
        "Writes the LEDGER as well as the summary, in one transaction:\n\n- `PAID` records a Payment row (`paymentMethod` is required — it is what the till is reconciled against)\n- `REFUNDED` reverses the successful payments, with a reason\n- `UNPAID` is refused once money has been recorded; refund it instead, or the customer is left holding a receipt for a payment the system denies\n\nMarking an order paid without writing the ledger is what let the payments report and the order list disagree about the same money.",
      permission: PERMISSIONS.ORDER_UPDATE_STATUS,
      parameters: [idParam],
      requestBody: jsonBody(updatePaymentSchema),
      responses: {
        200: ok("Settled.", ref("Order")),
        ...validationError,
        ...notFound,
        409: errorResponse("Already paid, nothing to refund, or money is already recorded."),
      },
    }),
  },

  // ---- Payments ---------------------------------------------------------
  "/payments/online": {
    post: operation({
      tag: "Payments",
      operationId: "initiateOnlinePayment",
      summary: "Start an online payment",
      description:
        "Public. Creates a PENDING payment and a provider intent; the diner confirms it on the checkout screen using the unguessable payment id returned here, so no other order is reachable. The built-in provider is a DEMO gateway — `isDemo` is true, and the client shows an unmistakable banner.",
      limit: "public-write",
      requestBody: jsonBody(initiatePaymentSchema),
      responses: {
        201: ok("Intent created.", {
          type: "object",
          properties: {
            paymentId: { type: "string" },
            orderNumber: { type: "string" },
            amount: money("Amount due."),
            amountMinor: { type: "integer", description: "The same amount in paise." },
            currency: { type: "string" },
            provider: { type: "string" },
            isDemo: { type: "boolean" },
          },
        }),
        ...notFound,
        409: errorResponse("Already paid, or the order was cancelled."),
        ...rateLimited,
      },
    }),
  },

  "/payments/{id}/confirm": {
    post: operation({
      tag: "Payments",
      operationId: "confirmOnlinePayment",
      summary: "Confirm an online payment",
      description:
        "DEMO: the outcome is whatever the payer chose on the checkout screen. A real gateway replaces this with signature verification of a webhook — the same method on the provider interface, so this flow does not change. On success the order is marked paid in the SAME transaction as the payment, so the ledger and the summary cannot disagree.",
      limit: "public-write",
      parameters: [idParam],
      requestBody: jsonBody(confirmPaymentSchema),
      responses: {
        200: ok("Captured.", {
          type: "object",
          properties: { paymentId: { type: "string" }, receiptNumber: { type: "string" } },
        }),
        400: errorResponse("The payment was not completed."),
        ...notFound,
        409: errorResponse("This payment was already completed."),
        ...rateLimited,
      },
    }),
  },

  "/payments/{id}/receipt": {
    get: operation({
      tag: "Payments",
      operationId: "getReceipt",
      summary: "Fetch a receipt",
      description: "Public: the payment id is an unguessable cuid held only by the person who paid.",
      limit: "public-lookup",
      parameters: [idParam],
      responses: { 200: ok("The receipt.", ref("Payment")), ...notFound, ...rateLimited },
    }),
  },

  "/payments/cash": {
    post: operation({
      tag: "Payments",
      operationId: "recordCashPayment",
      summary: "Record cash taken at the table",
      description: "Creates a SUCCESS payment for the history and marks the order paid, in one transaction.",
      permission: PERMISSIONS.ORDER_UPDATE_STATUS,
      requestBody: jsonBody(cashPaymentSchema),
      responses: {
        200: ok("Recorded.", ref("Payment")),
        ...validationError,
        ...notFound,
        409: errorResponse("This order is already paid."),
      },
    }),
  },

  "/payments/{id}/refund": {
    post: operation({
      tag: "Payments",
      operationId: "refundPayment",
      summary: "Refund a payment",
      description:
        "Behind `order:cancel` rather than `report:view`: refunding is money leaving the business, the same class of act as voiding an order, and staff who can TAKE a payment must not be able to undo one. Audited.\n\nThe row is reversed in place, so `totalCollected` stays a plain sum over SUCCESS and cannot double-count. The order summary follows: once no successful payment remains, the order becomes REFUNDED. A partly refunded order — several payments, one reversed — is still paid.",
      permission: PERMISSIONS.ORDER_CANCEL,
      parameters: [idParam],
      requestBody: jsonBody(refundPaymentSchema),
      responses: {
        200: ok("Refunded.", {
          type: "object",
          properties: { paymentId: { type: "string" }, status: { type: "string", const: "REFUNDED" } },
        }),
        ...validationError,
        ...notFound,
        409: errorResponse("Only a SUCCESS payment can be refunded."),
      },
    }),
  },

  "/payments": {
    get: operation({
      tag: "Payments",
      operationId: "listPayments",
      summary: "The payment ledger",
      description:
        "Every attempt, online and cash, successful and failed. `summary.totalCollected` is narrowed by the SAME filter as the rows, so the figure at the top of the screen always describes the list underneath it; refunded rows are excluded.",
      permission: PERMISSIONS.REPORT_VIEW,
      parameters: toParameters(paymentListQuerySchema, "query"),
      responses: {
        200: json("The ledger.", {
          type: "object",
          properties: {
            success: { type: "boolean", const: true },
            data: { type: "array", items: ref("Payment") },
            meta: ref("PaginationMeta"),
            summary: {
              type: "object",
              properties: { totalCollected: money("Collected under the active filter.") },
            },
          },
        }),
        ...validationError,
      },
    }),
  },

  // ---- Reservations -----------------------------------------------------
  "/reservations": {
    get: operation({
      tag: "Reservations",
      operationId: "listReservations",
      summary: "List bookings",
      description: "Soonest first: the floor cares about who is arriving next.",
      permission: PERMISSIONS.RESERVATION_READ,
      parameters: toParameters(reservationListQuerySchema, "query"),
      responses: { 200: okList("Bookings.", ref("Reservation")), ...validationError },
    }),
    post: operation({
      tag: "Reservations",
      operationId: "createReservation",
      summary: "Take a booking",
      description:
        "Public. Capacity is measured in SEATS, not tables: forty covers can be four parties of ten or twenty of two, and counting bookings would refuse the second and overbook the first.\n\nThe capacity check and the insert run in ONE transaction behind a lock, so two parties requesting the last few covers at the same moment cannot both be confirmed. When it is full, the 409 carries `details.alternatives` — nearby times that ARE free — so the guest is never left at a dead end.",
      limit: "public-write",
      requestBody: jsonBody(createReservationSchema),
      responses: {
        201: ok("Booked. `reference` is the code the guest quotes.", ref("Reservation")),
        ...validationError,
        409: json("Fully booked. `details.alternatives` lists nearby times.", ref("Error")),
        ...rateLimited,
      },
    }),
  },

  "/reservations/availability": {
    get: operation({
      tag: "Reservations",
      operationId: "checkAvailability",
      summary: "Seats free at a time",
      description:
        "ADVISORY ONLY — the answer can be stale by the time the guest acts on it. The booking endpoint re-checks inside its locked transaction, and that check is the binding one.",
      limit: "public-lookup",
      parameters: toParameters(availabilityQuerySchema, "query"),
      responses: {
        200: ok("Availability.", {
          type: "object",
          properties: {
            available: { type: "boolean" },
            seatsRemaining: { type: "integer" },
            totalCapacity: { type: "integer" },
          },
        }),
        ...validationError,
        ...rateLimited,
      },
    }),
  },

  "/reservations/lookup/{reference}": {
    get: operation({
      tag: "Reservations",
      operationId: "lookupReservation",
      summary: "Look up a booking",
      description: "Public. Returns only what the guest already knows from their confirmation.",
      limit: "public-lookup",
      parameters: [
        {
          name: "reference",
          in: "path",
          required: true,
          description: "The code on the confirmation, e.g. `R-ZDXWJ5`.",
          schema: { type: "string", examples: ["R-ZDXWJ5"] },
        },
      ],
      responses: { 200: ok("The booking.", ref("Reservation")), ...notFound, ...rateLimited },
    }),
  },

  "/reservations/lookup/{reference}/cancel": {
    post: operation({
      tag: "Reservations",
      operationId: "cancelReservationByGuest",
      summary: "Cancel your own booking",
      description:
        "The phone number is required as well as the reference. A six-character code alone is short enough to guess, and cancelling someone else's table must not be possible.",
      limit: "public-write",
      parameters: [
        {
          name: "reference",
          in: "path",
          required: true,
          schema: { type: "string", examples: ["R-ZDXWJ5"] },
        },
      ],
      requestBody: jsonBody(z.object({ phone: z.string().trim().min(6) })),
      responses: {
        200: ok("Cancelled."),
        404: errorResponse("No booking with that reference AND number."),
        409: errorResponse("Too late to cancel online."),
        ...rateLimited,
      },
    }),
  },

  "/reservations/{id}": {
    get: operation({
      tag: "Reservations",
      operationId: "getReservation",
      summary: "Fetch a booking",
      description: "The full house view, including the assigned table and linked guest record.",
      permission: PERMISSIONS.RESERVATION_READ,
      parameters: [idParam],
      responses: { 200: ok("The booking.", ref("Reservation")), ...notFound },
    }),
    patch: operation({
      tag: "Reservations",
      operationId: "updateReservation",
      summary: "Edit a booking",
      description:
        "Moving the time or party size re-runs the capacity check under the same lock as a new booking, excluding this booking so it does not count itself as a clash. Assigning a table refuses one too small for the party.",
      permission: PERMISSIONS.RESERVATION_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(updateReservationSchema),
      responses: {
        200: ok("Updated.", ref("Reservation")),
        ...validationError,
        ...notFound,
        409: errorResponse("Not enough seats free at that time."),
      },
    }),
  },

  "/reservations/{id}/status": {
    patch: operation({
      tag: "Reservations",
      operationId: "updateReservationStatus",
      summary: "Confirm, seat or close a booking",
      description:
        "`PENDING → CONFIRMED → SEATED → COMPLETED`, with cancellation from the live states. NO_SHOW is reachable only from CONFIRMED: a booking nobody accepted cannot be a no-show, and a seated party plainly showed up. Seating a party occupies its table; finishing releases it.",
      permission: PERMISSIONS.RESERVATION_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(reservationStatusUpdateSchema),
      responses: {
        200: ok("Status changed.", ref("Reservation")),
        ...validationError,
        ...notFound,
        409: errorResponse("That transition is not legal."),
      },
    }),
  },

  // ---- Tables -----------------------------------------------------------
  "/tables": {
    get: operation({
      tag: "Tables",
      operationId: "listTables",
      summary: "List tables",
      description: "The floor plan, filterable by status.",
      permission: PERMISSIONS.TABLE_READ,
      parameters: toParameters(tableListQuerySchema, "query"),
      responses: { 200: okList("Tables.", ref("Table")), ...validationError },
    }),
    post: operation({
      tag: "Tables",
      operationId: "createTable",
      summary: "Add a table",
      description: "A QR token is generated automatically; print it with the QR image endpoint.",
      permission: PERMISSIONS.TABLE_CREATE,
      requestBody: jsonBody(createTableSchema),
      responses: { 201: ok("Created.", ref("Table")), ...validationError, 409: errorResponse("That table number exists.") },
    }),
  },

  "/tables/scan/{token}": {
    get: operation({
      tag: "Tables",
      operationId: "scanTable",
      summary: "Resolve a scanned QR code",
      description:
        "Public — this is the first request a diner's phone makes. Returns the table behind the token so the app can open a session against it. An inactive or withdrawn table stops resolving here.",
      parameters: [
        {
          name: "token",
          in: "path",
          required: true,
          description: "The token embedded in the QR URL.",
          schema: { type: "string" },
        },
      ],
      responses: { 200: ok("The table.", ref("ScannedTable")), 400: errorResponse("This QR code is not valid.") },
    }),
  },

  "/tables/{id}": {
    get: operation({
      tag: "Tables",
      operationId: "getTable",
      summary: "Fetch a table",
      description: "Includes the QR token, which the scan endpoint deliberately does not return.",
      permission: PERMISSIONS.TABLE_READ,
      parameters: [idParam],
      responses: { 200: ok("The table.", ref("Table")), ...notFound },
    }),
    patch: operation({
      tag: "Tables",
      operationId: "updateTable",
      summary: "Edit a table",
      description: "Number, capacity and status.",
      permission: PERMISSIONS.TABLE_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(updateTableSchema),
      responses: { 200: ok("Updated.", ref("Table")), ...validationError, ...notFound },
    }),
    delete: operation({
      tag: "Tables",
      operationId: "deleteTable",
      summary: "Delete a table",
      description: "Orders that referenced it keep their history; the link is simply cleared.",
      permission: PERMISSIONS.TABLE_DELETE,
      parameters: [idParam],
      responses: { 200: ok("Deleted."), ...notFound },
    }),
  },

  "/tables/{id}/active": {
    patch: operation({
      tag: "Tables",
      operationId: "setTableActive",
      summary: "Withdraw or restore a table",
      description: "A withdrawn table's QR code stops resolving, so nobody can order against it.",
      permission: PERMISSIONS.TABLE_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(z.object({ isActive: booleanish })),
      responses: { 200: ok("Changed.", ref("Table")), ...validationError, ...notFound },
    }),
  },

  "/tables/{id}/qr.png": {
    get: operation({
      tag: "Tables",
      operationId: "getTableQrImage",
      summary: "QR code image",
      description: "Rendered on demand from the table's CURRENT token, so a rotated code is never served stale.",
      permission: PERMISSIONS.TABLE_READ,
      parameters: [idParam],
      responses: {
        200: {
          description: "PNG image, ready to print.",
          content: { "image/png": { schema: { type: "string", format: "binary" } } },
        },
        ...notFound,
      },
    }),
  },

  "/tables/{id}/qr/rotate": {
    post: operation({
      tag: "Tables",
      operationId: "rotateTableQr",
      summary: "Rotate the QR token",
      description:
        "Issues a NEW token and invalidates the old one — what you do when a sticker is photographed and shared. Behind its own permission and audited, because it invalidates something physically printed. Historical orders are unaffected: they reference the table, not the token.",
      permission: PERMISSIONS.QR_MANAGE,
      parameters: [idParam],
      responses: { 200: ok("Rotated; the old code no longer resolves.", ref("Table")), ...notFound },
    }),
  },

  "/tables/{id}/qr/regenerate": {
    post: operation({
      tag: "Tables",
      operationId: "regenerateTableQr",
      summary: "Re-render the QR image",
      description: "Redraws the image for the EXISTING token. Printed codes keep working — use rotate to invalidate them.",
      permission: PERMISSIONS.QR_MANAGE,
      parameters: [idParam],
      responses: { 200: ok("Re-rendered.", ref("Table")), ...notFound },
    }),
  },

  // ---- Notifications ----------------------------------------------------
  "/notifications": {
    get: operation({
      tag: "Notifications",
      operationId: "listNotifications",
      summary: "The bell",
      description:
        "Recent notifications with THIS user's read state. Read state is per staff member: clearing your own bell does not hide a new order from the rest of the team.",
      permission: "authenticated",
      responses: {
        200: ok("Notifications and this user's unread count.", {
          type: "object",
          properties: {
            notifications: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  type: { type: "string", enum: ["ORDER_PLACED", "ORDER_STATUS_CHANGED", "SYSTEM"] },
                  title: { type: "string" },
                  message: { type: "string" },
                  isRead: { type: "boolean", description: "For the calling user only." },
                  readAt: { type: ["string", "null"], format: "date-time" },
                  metadata: { type: ["object", "null"], description: "Deep-link payload, e.g. `{ orderId }`." },
                  createdAt: { type: "string", format: "date-time" },
                },
              },
            },
            unread: { type: "integer" },
          },
        }),
      },
    }),
  },

  "/notifications/{id}/read": {
    patch: operation({
      tag: "Notifications",
      operationId: "markNotificationRead",
      summary: "Mark one read",
      description: "Idempotent — opening the same notification twice is not an error.",
      permission: "authenticated",
      parameters: [idParam],
      responses: { 200: ok("Marked read."), ...notFound },
    }),
  },

  "/notifications/read-all": {
    post: operation({
      tag: "Notifications",
      operationId: "markAllNotificationsRead",
      summary: "Clear your bell",
      description: "Affects only the calling user. Returns how many were newly marked.",
      permission: "authenticated",
      responses: { 200: ok("Cleared.") },
    }),
  },

  // ---- Admin: users -----------------------------------------------------
  "/admin/users": {
    get: operation({
      tag: "Administration",
      operationId: "listUsers",
      summary: "List staff accounts",
      description: "Deactivated accounts are hidden unless `includeInactive` is set.",
      permission: PERMISSIONS.USER_READ,
      parameters: toParameters(userListQuerySchema, "query"),
      responses: { 200: okList("Staff accounts.", { type: "object" }), ...validationError },
    }),
    post: operation({
      tag: "Administration",
      operationId: "createUser",
      summary: "Create a staff account",
      description: "The password is hashed with bcrypt; the plaintext is never stored or logged. Audited.",
      permission: PERMISSIONS.USER_CREATE,
      requestBody: jsonBody(createUserSchema),
      responses: { 201: ok("Created."), ...validationError, 409: errorResponse("That email is taken.") },
    }),
  },

  "/admin/users/{id}": {
    get: operation({
      tag: "Administration",
      operationId: "getUser",
      summary: "Fetch a staff account",
      description: "Never includes the password hash.",
      permission: PERMISSIONS.USER_READ,
      parameters: [idParam],
      responses: { 200: ok("The account."), ...notFound },
    }),
    patch: operation({
      tag: "Administration",
      operationId: "updateUser",
      summary: "Edit a staff account",
      description:
        "The password is deliberately ABSENT here. Changing someone else's password is a more sensitive act with its own endpoint, not a field buried in a profile edit.",
      permission: PERMISSIONS.USER_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(updateUserSchema),
      responses: { 200: ok("Updated."), ...validationError, ...notFound },
    }),
    delete: operation({
      tag: "Administration",
      operationId: "deactivateUser",
      summary: "Deactivate a staff account",
      description: "A soft delete that also revokes every session, so access ends immediately rather than at token expiry. Audited.",
      permission: PERMISSIONS.USER_DELETE,
      parameters: [idParam],
      responses: { 200: ok("Deactivated."), ...notFound },
    }),
  },

  "/admin/users/{id}/reset-password": {
    post: operation({
      tag: "Administration",
      operationId: "resetUserPassword",
      summary: "Reset someone's password",
      description:
        "Revokes all of that user's existing sessions, so a compromised account cannot keep working from an old token. The audit trail redacts the password before storing the entry.",
      permission: PERMISSIONS.USER_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(resetPasswordSchema),
      responses: { 200: ok("Reset; their sessions were revoked."), ...validationError, ...notFound },
    }),
  },

  // ---- Admin: roles -----------------------------------------------------
  "/admin/roles": {
    get: operation({
      tag: "Administration",
      operationId: "listRoles",
      summary: "List roles",
      description: "Built-in roles are flagged `isSystem` and cannot be renamed or deleted.",
      permission: PERMISSIONS.ROLE_READ,
      responses: { 200: ok("Roles.") },
    }),
    post: operation({
      tag: "Administration",
      operationId: "createRole",
      summary: "Create a role",
      description: "Names are UPPER_SNAKE_CASE so they stay usable as stable identifiers.",
      permission: PERMISSIONS.ROLE_CREATE,
      requestBody: jsonBody(createRoleSchema),
      responses: { 201: ok("Created."), ...validationError, 409: errorResponse("That name exists.") },
    }),
  },

  "/admin/roles/{id}": {
    get: operation({
      tag: "Administration",
      operationId: "getRole",
      summary: "Fetch a role",
      description: "Includes its permission keys.",
      permission: PERMISSIONS.ROLE_READ,
      parameters: [idParam],
      responses: { 200: ok("The role."), ...notFound },
    }),
    patch: operation({
      tag: "Administration",
      operationId: "updateRole",
      summary: "Edit a role",
      description: "Refused on built-in roles.",
      permission: PERMISSIONS.ROLE_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(updateRoleSchema),
      responses: { 200: ok("Updated."), ...validationError, ...notFound },
    }),
    delete: operation({
      tag: "Administration",
      operationId: "deleteRole",
      summary: "Delete a role",
      description: "Refused while staff are still assigned to it, and on built-in roles.",
      permission: PERMISSIONS.ROLE_DELETE,
      parameters: [idParam],
      responses: { 200: ok("Deleted."), ...notFound, 409: errorResponse("Still assigned, or built-in.") },
    }),
  },

  "/admin/roles/{id}/permissions": {
    put: operation({
      tag: "Administration",
      operationId: "setRolePermissions",
      summary: "Replace a role's permissions",
      description:
        "Wholesale replacement, not a merge — PUT, because the body IS the new set. The most consequential administrative action in the system, so it is always audited.\n\nSUPER_ADMIN is not editable: it bypasses permission checks entirely, so it cannot be locked out by a bad grant.",
      permission: PERMISSIONS.PERMISSION_ASSIGN,
      parameters: [idParam],
      requestBody: jsonBody(setRolePermissionsSchema),
      responses: { 200: ok("Permissions replaced."), ...validationError, ...notFound },
    }),
  },

  "/admin/permissions": {
    get: operation({
      tag: "Administration",
      operationId: "listPermissions",
      summary: "The permission catalogue",
      description: "Every capability the system can authorise, grouped for the management screen.",
      permission: PERMISSIONS.PERMISSION_READ,
      responses: { 200: ok("Permissions, grouped.") },
    }),
  },

  // ---- Admin: customers -------------------------------------------------
  "/admin/customers": {
    get: operation({
      tag: "Administration",
      operationId: "listCustomers",
      summary: "List guests",
      description: "Guests have no credentials — they are identified by the phone number they left when ordering.",
      permission: PERMISSIONS.CUSTOMER_READ,
      parameters: toParameters(customerListQuerySchema, "query"),
      responses: { 200: okList("Guests.", { type: "object" }), ...validationError },
    }),
  },

  "/admin/customers/{id}": {
    get: operation({
      tag: "Administration",
      operationId: "getCustomer",
      summary: "Fetch a guest",
      description: "With their recent order history, bounded — a regular's history could otherwise be thousands of rows.",
      permission: PERMISSIONS.CUSTOMER_READ,
      parameters: [idParam],
      responses: { 200: ok("The guest."), ...notFound },
    }),
    patch: operation({
      tag: "Administration",
      operationId: "updateCustomer",
      summary: "Edit a guest",
      description: "Refused if the phone number already belongs to another guest.",
      permission: PERMISSIONS.CUSTOMER_UPDATE,
      parameters: [idParam],
      requestBody: jsonBody(updateCustomerSchema),
      responses: { 200: ok("Updated."), ...validationError, ...notFound, 409: errorResponse("That number is taken.") },
    }),
  },

  // ---- Admin: settings --------------------------------------------------
  "/admin/settings": {
    get: operation({
      tag: "Administration",
      operationId: "getSettings",
      summary: "Full restaurant settings",
      description: "Everything, including the internal contact details the public endpoint withholds.",
      permission: PERMISSIONS.SETTINGS_READ,
      responses: { 200: ok("Settings.") },
    }),
    patch: operation({
      tag: "Administration",
      operationId: "updateSettings",
      summary: "Edit restaurant settings",
      description:
        "Percentages are strings for the same reason prices are — exact decimals. Changing tax or service charge affects orders placed AFTERWARDS; existing orders keep the totals they were invoiced with. Audited.",
      permission: PERMISSIONS.SETTINGS_UPDATE,
      requestBody: jsonBody(updateSettingsSchema),
      responses: { 200: ok("Updated."), ...validationError },
    }),
  },

  // ---- Admin: reports ---------------------------------------------------
  "/admin/reports/dashboard": {
    get: operation({
      tag: "Reports",
      operationId: "dashboardSummary",
      summary: "Dashboard summary",
      description:
        "Today's trading plus live operational counts. \"Today\" is the trading day in `REPORT_TIMEZONE`, the same boundary every other report buckets on — stated in the response so a manager reading from another timezone knows what it means.",
      permission: PERMISSIONS.DASHBOARD_VIEW,
      responses: { 200: ok("The summary.", ref("DashboardSummary")) },
    }),
  },

  "/admin/reports/sales": {
    get: operation({
      tag: "Reports",
      operationId: "salesReport",
      summary: "Revenue per day",
      description:
        "Aggregated in the database, bucketed by trading day in the reporting timezone. Cancelled orders are excluded everywhere — including them would report money that was never taken.",
      permission: PERMISSIONS.REPORT_VIEW,
      parameters: toParameters(reportQuerySchema, "query"),
      responses: {
        200: ok("Daily takings.", {
          type: "object",
          properties: {
            days: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", examples: ["2026-07-27"] },
                  orders: { type: "integer" },
                  revenue: money("Taken that day."),
                },
              },
            },
            totals: {
              type: "object",
              properties: { orders: { type: "integer" }, revenue: money("Over the range.") },
            },
          },
        }),
        ...validationError,
      },
    }),
  },

  "/admin/reports/revenue": {
    get: operation({
      tag: "Reports",
      operationId: "revenueBreakdown",
      summary: "Revenue by period",
      description:
        "Daily, weekly, monthly or yearly buckets, plus a payment-method split for reconciling the till and headline collected/outstanding totals. Bucket dates are wall-clock readings in the restaurant's timezone and deliberately carry no `Z`.",
      permission: PERMISSIONS.REPORT_VIEW,
      parameters: toParameters(revenuePeriodSchema, "query"),
      responses: {
        200: ok("The breakdown.", {
          type: "object",
          properties: {
            period: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
            label: { type: "string", examples: ["Last 30 days"] },
            buckets: { type: "array", items: { type: "object" } },
            payments: { type: "array", items: { type: "object" } },
            totals: { type: "object" },
          },
        }),
        ...validationError,
      },
    }),
  },

  "/admin/reports/top-items": {
    get: operation({
      tag: "Reports",
      operationId: "topItems",
      summary: "Best sellers",
      description: "By quantity sold. Names come from the order-item snapshot, so a renamed dish still reports under the name it was sold as.",
      permission: PERMISSIONS.REPORT_VIEW,
      parameters: toParameters(reportQuerySchema, "query"),
      responses: { 200: ok("Best sellers."), ...validationError },
    }),
  },

  "/admin/reports/order-status": {
    get: operation({
      tag: "Reports",
      operationId: "orderStatusBreakdown",
      summary: "Orders by status",
      description: "Counts per status for the operations view. Unlike revenue, this INCLUDES cancellations — that is the point of it.",
      permission: PERMISSIONS.REPORT_VIEW,
      parameters: toParameters(reportQuerySchema, "query"),
      responses: { 200: ok("Counts by status."), ...validationError },
    }),
  },

  "/admin/reports/top-customers": {
    get: operation({
      tag: "Reports",
      operationId: "topCustomers",
      summary: "Highest-spending guests",
      description: "Only guests who left a phone number are tracked; anonymous orders are not attributed.",
      permission: PERMISSIONS.REPORT_VIEW,
      responses: { 200: ok("Top guests.") },
    }),
  },

  "/admin/audit-logs": {
    get: operation({
      tag: "Administration",
      operationId: "listAuditLogs",
      summary: "The audit trail",
      description:
        "Append-only, and read-only by design: there is no write endpoint and no update path, because an audit trail that can be edited is not an audit trail. Records who did what, when, from where, with before/after snapshots.",
      permission: PERMISSIONS.AUDIT_LOG_READ,
      parameters: toParameters(auditListQuerySchema, "query"),
      responses: { 200: okList("Audit entries.", { type: "object" }), ...validationError },
    }),
  },
};

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

const DESCRIPTION = `
A QR ordering and management system for a restaurant. Two audiences share one API:

- **Diners** scan a table's QR code and order with no account at all. Those endpoints are public and rate limited.
- **Staff** sign in and are gated per route by PERMISSION, so a chef, a waiter and a manager each reach only what their job needs.

### Authentication

\`POST /api/auth/login\` returns a short-lived **access token** in the body and sets a long-lived **refresh token** as an httpOnly cookie. Send the access token as \`Authorization: Bearer <token>\`. When it expires, call \`POST /api/auth/refresh\` — a browser sends no body, because the cookie carries the token.

The refresh token is never in the response body on purpose: a token JavaScript can read is a token an XSS bug can steal.

### Money

Every monetary value crosses the wire as an exact decimal **string** (\`"349.00"\`), never a float. Binary floating point cannot represent most decimal fractions, so a bill accumulated in \`number\` drifts. Do arithmetic in integer minor units (paise) and format at the end.

Clients quoting a total must apply **both** \`taxPercent\` and \`serviceChargePercent\` from \`GET /api/settings\`, each to the subtotal and never compounded — that is what the server does.

### Errors

Every failure returns the same envelope: \`{ success: false, message, details? }\`. Validation failures list the offending fields in \`details\`. Statuses are meaningful — 409 means the request conflicts with current state and retrying it unchanged will fail again, while 429 means retry later.

### Real time

Order and menu changes are also pushed over Socket.IO. Staff authenticate the handshake with the same access token and join role-scoped rooms; a diner may join exactly one room, named after an order number they already hold.
`.trim();

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Restaurant QR Ordering & Management API",
    version: "1.0.0",
    description: DESCRIPTION,
    license: { name: "ISC", identifier: "ISC" },
  },
  servers: [
    { url: "/api", description: "This server" },
    { url: "http://localhost:5000/api", description: "Local development" },
  ],
  tags: [
    { name: "Meta", description: "Health and public restaurant settings." },
    { name: "Auth", description: "Staff sign-in, token refresh and session revocation." },
    { name: "Menu", description: "Categories and dishes. Browsing is public; editing is not." },
    { name: "Orders", description: "The ordering lifecycle, from a scanned QR code to a served table." },
    { name: "Payments", description: "The ledger. Payment rows are the record; an order's payment status is only their summary." },
    { name: "Reservations", description: "Table bookings, with seat-based capacity." },
    { name: "Tables", description: "The floor plan and the QR codes printed for it." },
    { name: "Notifications", description: "The staff bell. Read state is per person." },
    { name: "Reports", description: "Trading figures, bucketed by the restaurant's own trading day." },
    { name: "Administration", description: "Staff accounts, roles, permissions, guests, settings and the audit trail." },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "The access token from `POST /api/auth/login`. Short-lived by design — refresh it rather than lengthening it.",
      },
      refreshCookie: {
        type: "apiKey",
        in: "cookie",
        name: "refreshToken",
        description:
          "httpOnly, SameSite=Lax, scoped to `/api/auth`. Set by login; sent automatically by the browser. Not readable by JavaScript, which is the whole point.",
      },
    },
    schemas: components,
  },
} as const satisfies Record<string, unknown>;

/** Serialised once at startup; the document never changes at runtime. */
export const openApiJson = JSON.stringify(openApiDocument, null, 2);
