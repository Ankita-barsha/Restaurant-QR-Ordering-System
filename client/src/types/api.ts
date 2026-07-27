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

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "SERVED"
  | "CANCELLED";

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

export interface Food {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Exact decimal string, e.g. "349.00". */
  price: string;
  imageUrl: string | null;
  isAvailable: boolean;
  isVegetarian: boolean;
  preparationMinutes: number | null;
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
  /** Four-character pickup code the waiter must verify before serving. */
  verificationCode: string | null;
  status: OrderStatus;
  type: OrderType;
  paymentStatus: PaymentStatus;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  notes: string | null;
  placedAt: string;
  confirmedAt: string | null;
  preparedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
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
  verificationCode: string | null;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  type: OrderType;
  totalAmount: string;
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
  live: { openOrders: number; pending: number; preparing: number; ready: number };
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
