/**
 * Cart and table session.
 *
 * Two responsibilities that belong together for a QR diner:
 *   - which TABLE they scanned (survives a page reload)
 *   - what they have added to the cart
 *
 * Prices are carried as exact decimal strings and never summed as floats.
 * The total shown here is INDICATIVE only — the server recalculates every
 * price when the order is placed, so a tampered cart changes nothing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { sumMoney } from "../lib/format";
import type { Food, ScannedTable } from "../types/api";

export interface CartItem {
  foodId: string;
  name: string;
  price: string;
  imageUrl: string | null;
  quantity: number;
  notes?: string;
}

interface CartContextValue {
  table: ScannedTable | null;
  qrToken: string | null;
  setTableSession: (table: ScannedTable, qrToken: string) => void;
  clearTableSession: () => void;

  items: CartItem[];
  itemCount: number;
  subtotal: string;
  addItem: (food: Food) => void;
  removeItem: (foodId: string) => void;
  increase: (foodId: string) => void;
  decrease: (foodId: string) => void;
  setNotes: (foodId: string, notes: string) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * sessionStorage, not localStorage.
 *
 * A table session should last the meal, not forever. sessionStorage clears
 * when the tab closes, so the next diner on a shared device does not inherit
 * the previous table's session.
 */
const TABLE_KEY = "qr.table";
const TOKEN_KEY = "qr.token";
const CART_KEY = "qr.cart";

/**
 * Tracking token of the most recent order placed on this device.
 *
 * The token is issued once, in the response to placing the order, and is the
 * only way back to the tracking page — so it is kept here to survive a reload
 * or a closed tab. Exported because /track reads it when opened without a
 * token in the URL.
 */
export const LAST_ORDER_KEY = "qr.lastOrder";

const readStored = <T,>(key: string): T | null => {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [table, setTable] = useState<ScannedTable | null>(() =>
    readStored<ScannedTable>(TABLE_KEY)
  );
  const [qrToken, setQrToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY)
  );
  const [items, setItems] = useState<CartItem[]>(
    () => readStored<CartItem[]>(CART_KEY) ?? []
  );

  // Persisted so a reload mid-order does not lose the basket.
  useEffect(() => {
    sessionStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const setTableSession = useCallback((scanned: ScannedTable, token: string) => {
    setTable(scanned);
    setQrToken(token);
    sessionStorage.setItem(TABLE_KEY, JSON.stringify(scanned));
    sessionStorage.setItem(TOKEN_KEY, token);
  }, []);

  const clearTableSession = useCallback(() => {
    setTable(null);
    setQrToken(null);
    sessionStorage.removeItem(TABLE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }, []);

  const addItem = useCallback((food: Food) => {
    setItems((previous) => {
      const existing = previous.find((item) => item.foodId === food.id);

      if (existing) {
        return previous.map((item) =>
          item.foodId === food.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [
        ...previous,
        {
          foodId: food.id,
          name: food.name,
          price: food.price,
          imageUrl: food.imageUrl,
          quantity: 1,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((foodId: string) => {
    setItems((previous) => previous.filter((item) => item.foodId !== foodId));
  }, []);

  const increase = useCallback((foodId: string) => {
    setItems((previous) =>
      previous.map((item) =>
        item.foodId === foodId ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  }, []);

  /** Dropping to zero removes the line rather than leaving a 0-quantity row. */
  const decrease = useCallback((foodId: string) => {
    setItems((previous) =>
      previous
        .map((item) =>
          item.foodId === foodId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const setNotes = useCallback((foodId: string, notes: string) => {
    setItems((previous) =>
      previous.map((item) => (item.foodId === foodId ? { ...item, notes } : item))
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      table,
      qrToken,
      setTableSession,
      clearTableSession,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: sumMoney(items),
      addItem,
      removeItem,
      increase,
      decrease,
      setNotes,
      clearCart,
    }),
    [
      table,
      qrToken,
      items,
      setTableSession,
      clearTableSession,
      addItem,
      removeItem,
      increase,
      decrease,
      setNotes,
      clearCart,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextValue => {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>");
  }

  return context;
};
