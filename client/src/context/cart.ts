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

/**
 * Tracking token of the most recent order placed on this device.
 *
 * The token is issued once, in the response to placing the order, and is the
 * only way back to the tracking page — so it is kept in sessionStorage to
 * survive a reload or a closed tab. It lives here rather than in
 * CartContext.tsx because that file exports only components.
 */
export const LAST_ORDER_KEY = "qr.lastOrder";

export const CartContext = createContext<CartContextValue | null>(null);

export const useCart = (): CartContextValue => {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }

  return context;
};
