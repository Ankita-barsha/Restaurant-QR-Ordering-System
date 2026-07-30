/**
 * The cart context object, its types and its hook.
 *
 * Split from CartContext.tsx so that file exports only components — see the
 * note in ./auth.
 */

import { createContext, useContext } from "react";

import type { Food, ScannedTable } from "../types/api";

export interface CartItem {
  foodId: string;
  name: string;
  /**
   * What this line is charged, per unit — the OFFER price when the dish was on
   * offer, otherwise its list price. Summing anything else would quote the
   * diner a total the server does not agree with.
   */
  price: string;
  /**
   * The list price, when an offer applied. Present only so the cart can strike
   * it through; it is never summed. Absent on a dish with no offer, and on
   * lines added before offers existed.
   */
  listPrice?: string | null;
  imageUrl: string | null;
  quantity: number;
  notes?: string;
}

export interface CartContextValue {
  table: ScannedTable | null;
  qrToken: string | null;
  setTableSession: (table: ScannedTable, qrToken: string) => void;
  clearTableSession: () => void;

  items: CartItem[];
  itemCount: number;
  /** Exact decimal string, for display. */
  subtotal: string;
  /**
   * The same figure in integer paise. Exposed so the checkout screen can add
   * tax and service charge without ever converting back through a float.
   */
  subtotalMinor: number;
  addItem: (food: Food, notes?: string) => void;
  removeItem: (foodId: string) => void;
  increase: (foodId: string) => void;
  decrease: (foodId: string) => void;
  setNotes: (foodId: string, notes: string) => void;
  clearCart: () => void;
}

/** Tracking token storage keys for active and historical orders. */
export const LAST_ORDER_KEY = "restaurant_last_order_token";
export const MY_ORDERS_LIST_KEY = "restaurant_my_order_tokens";

/** Saves tracking token securely to device order history. */
export const saveOrderToken = (token: string) => {
  sessionStorage.setItem(LAST_ORDER_KEY, token);
  localStorage.setItem(LAST_ORDER_KEY, token);

  try {
    const raw = localStorage.getItem(MY_ORDERS_LIST_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const updated = [token, ...existing.filter((t) => t !== token)];
    localStorage.setItem(MY_ORDERS_LIST_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage parse errors
  }
};

/** Returns array of tracking tokens for orders placed on this device. */
export const getMyOrderTokens = (): string[] => {
  try {
    const raw = localStorage.getItem(MY_ORDERS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // Fallback
  }
  const last = sessionStorage.getItem(LAST_ORDER_KEY) || localStorage.getItem(LAST_ORDER_KEY);
  return last ? [last] : [];
};

export const CartContext = createContext<CartContextValue | null>(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }
  return context;
};
