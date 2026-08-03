/**
 * API types.
 *
 * These mirror the server's responses exactly. Two things differ from the
 * old local mock types and matter:
 *
 *   - `id` is a cuid STRING, not a number.
 *   - `price` is a decimal STRING ("349.00"), not a number. The server stores
 *     money as an exact Decimal; parsing it into a JS float here would
 *     reintroduce the rounding error the backend went to lengths to avoid.
 *     Format it for display, do arithmetic in paise.
 */

/**
 * The order workflow.
 *
 * The two AWAITING_ states are holds placed on a large order BEFORE the
 * kitchen is told about it — one waiting on a deposit, one waiting on a member
 * of staff to confirm the table is real. Neither appears on the Kitchen
 * Display; that is the point of them.
 */
export type OrderStatus =
  | "NEEDS_APPROVAL"
  | "AWAITING_ADVANCE_PAYMENT"
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "CANCELLED";

/** Statuses in which nothing moves until a person or a payment intervenes. */
export const isHeldStatus = (status: OrderStatus): boolean =>
  status === "NEEDS_APPROVAL" || status === "AWAITING_ADVANCE_PAYMENT";

export type OrderType = "DINE_IN" | "TAKEAWAY";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED" | "INACTIVE";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  _count?: { foods: number };
}

/** How a menu offer reduces a dish's price. */
export type OfferType = "PERCENTAGE" | "FIXED";

export interface Food {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /**
   * The LIST price, as an exact decimal string, e.g. "349.00".
   *
   * An offer never rewrites this. What a dish actually costs is
   * `offerPrice` when an offer is running — use `effectivePrice()` from
   * lib/offer rather than reading either field directly.
   */
  price: string;
  /** Master switch. False means the dish sells at `price`. */
  isOfferActive: boolean;
  offerType: OfferType | null;
  /** A percentage (0-100) for PERCENTAGE, otherwise an amount of money. */
  offerValue: string | null;
  /** Derived server-side. Null when no offer is running. */
  offerPrice: string | null;
  /** Custom badge wording; blank falls back to one derived from the discount. */
  offerLabel: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  isVegetarian: boolean;
  /** The chef's recommendation. Featured dishes lead the welcome page. */
  isFeatured: boolean;
  preparationMinutes: number | null;
  customPreferences?: string | null;
  categoryId: string;
  category: { id: string; name: string; slug: string };
}

/** What GET /api/tables/scan/:token returns to a diner. */
export interface ScannedTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
}

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  qrToken: string;
  qrImageUrl: string | null;
  isActive: boolean;
  scanUrl?: string;
}

export interface OrderItem {
  id: string;
  foodId: string;
  /** Snapshot taken at purchase time — not the live menu name. */
  foodName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  notes: string | null;
}

export interface Order {
  id: string;
  orderNumber: string;
  /**
   * Unguessable per-order secret. Present on the response to placing an order
   * — that is the only time the diner receives it — and on staff reads.
   */
  trackingToken: string;
  status: OrderStatus;
  type: OrderType;
  paymentStatus: PaymentStatus;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  notes: string | null;
  /**
   * The advance owed before this order reaches the kitchen.
   *
   * Set only on a high-value order the gate caught; null on everything else,
   * which is how the staff screens know whether to show an advance at all.
   */
  advanceAmount: string | null;
  placedAt: string;
  confirmedAt: string | null;
  preparedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Who released a held order, and when. Null if it was never held. */
  approvedAt: string | null;
  items: OrderItem[];
  table: { id: string; tableNumber: string } | null;
  customer: { id: string; name: string | null; phone: string | null } | null;
  handledBy: { id: string; fullName: string } | null;
  /** Estimated cook time in minutes. Present only on kitchen-queue orders. */
  estimatedMinutes?: number;
}

/** The trimmed shape returned by the public tracking endpoint. */
export interface TrackedOrder {
  orderNumber: string;
  /**
   * Echoed back so the page can subscribe, fetch its invoice and pay without
   * re-parsing the URL.
   */
  trackingToken: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  type: OrderType;
  totalAmount: string;
  /**
   * The advance that must be collected before the kitchen is told, when this
   * order was held. Null on an ordinary order — which is how the tracking
   * screen knows not to show the advance dialog at all.
   */
  advanceAmount: string | null;
  placedAt: string;
  confirmedAt: string | null;
  preparedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  table: { tableNumber: string } | null;
  items: { foodName: string; quantity: number; lineTotal: string; notes: string | null }[];
}

export interface KitchenQueue {
  pending: Order[];
  confirmed: Order[];
  preparing: Order[];
  ready: Order[];
  total: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: { id: string; name: string };
  permissions: string[];
}

export interface DashboardSummary {
  today: {
    /** The trading day these figures cover, "YYYY-MM-DD" in `timezone`. */
    date: string;
    /** IANA zone the restaurant's trading day is measured in. */
    timezone: string;
    revenue: string;
    orders: number;
    averageOrderValue: string;
  };
  live: {
    openOrders: number;
    pending: number;
    preparing: number;
    ready: number;
    /** Large orders the kitchen has NOT been told about, waiting on someone. */
    held: number;
  };
  tables: { total: number; occupied: number; free: number };
  menu: { total: number; soldOut: number };
  customers: number;
}

export interface PublicSettings {
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  currency: string;
  taxPercent: string;
  serviceChargePercent: string;
  isAcceptingOrders: boolean;
  openingTime: string | null;
  closingTime: string | null;
  address: string;
  phone: string | null;
  bankingName?: string | null;
  merchantVpa?: string | null;
  bankAccountNo?: string | null;
  bankIfscCode?: string | null;
  paymentGatewayProvider?: string | null;
  /**
   * Whether the restaurant is taking real money.
   *
   * A boolean, and deliberately the ONLY gateway fact the public endpoint
   * exposes. The key id, key secret, webhook secret and Paytm merchant id used
   * to be returned here — meaning the Razorpay key SECRET was readable by
   * anyone who opened the menu. They are gone; the publishable key now arrives
   * with a payment intent, and only when there is something to pay.
   */
  gatewayIsLive?: boolean;
  paytmMerchantId?: string | null;

  /**
   * High-value order policy, as much of it as a guest is entitled to see.
   *
   * The THRESHOLD is deliberately absent: publishing it tells anyone probing
   * the system exactly what to stay under, and a guest never needs the number
   * — they are told the outcome, and only once their own balance crosses it.
   */
  advancePaymentPercent?: string;
  advancePaymentMessage?: string | null;
  allowCashAdvance?: boolean;
  allowOnlineAdvance?: boolean;
}

/**
 * Editable welcome-page copy.
 *
 * Every field is nullable and the page falls back to its built-in text, so an
 * untouched CMS renders exactly as the site did before one existed.
 */
export interface SiteContent {
  heroEyebrow: string | null;
  heroTitle: string | null;
  heroLede: string | null;
  bannerText: string | null;
  featuredEyebrow: string | null;
  featuredTitle: string | null;
  featuredLede: string | null;
  aboutEyebrow: string | null;
  aboutTitle: string | null;
  aboutBody: string | null;
  footerNote: string | null;
}

/** A curated testimonial. Written and published by the house, not by diners. */
export interface Review {
  id: string;
  customerName: string;
  imageUrl: string | null;
  rating: number;
  comment: string;
  visitedOn: string | null;
  isVisible: boolean;
  sortOrder: number;
  createdAt: string;
}

/** A row of the highest-selling items report. */
export interface TopSellingItem {
  foodId: string;
  foodName: string;
  quantitySold: number;
  revenue: string;
}

/**
 * A generated invoice.
 *
 * Every amount is a decimal string restated from what the order was CHARGED —
 * never recomputed here from the live menu or the current tax rate.
 */
export interface Invoice {
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: string;
  financialYear?: string;
  placeOfSupply?: string;
  gstin?: string | null;
  fssaiLicence?: string | null;
  legalName?: string | null;
  restaurant: {
    name: string;
    logoUrl: string | null;
    address: string;
    phone: string | null;
    email: string | null;
    currency: string;
    gstin?: string | null;
    fssaiLicence?: string | null;
    legalName?: string | null;
    stateCode?: string | null;
  };
  table: string | null;
  orderType: OrderType;
  customer: { name: string | null; phone: string | null } | null;
  items: {
    id: string;
    name: string;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
    notes: string | null;
    hsnSac?: string;
    gstRatePercent?: string;
    cgstAmount?: string;
    sgstAmount?: string;
  }[];
  totals: {
    subtotal: string;
    tax: string;
    discount: string;
    grandTotal: string;
    amountPaid: string;
    balanceDue: string;
    cgstTotal?: string;
    sgstTotal?: string;
    cgstRate?: string;
    sgstRate?: string;
    roundOff?: string;
  };
  payment: {
    status: PaymentStatus;
    method: string | null;
    receiptNumber: string | null;
    paidAt: string | null;
  };
  status: OrderStatus;
  isCancelled: boolean;
}

/** Envelope every endpoint responds with. */
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
