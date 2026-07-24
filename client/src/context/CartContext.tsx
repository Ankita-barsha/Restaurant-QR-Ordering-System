import { createContext, useState, type ReactNode } from "react";
import type { Food } from "../types/food";

export interface CartItem extends Food {
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (food: Food) => void;
  increaseQuantity: (id: number) => void;
  decreaseQuantity: (id: number) => void;
}

export const CartContext = createContext<CartContextType>({
  cart: [],
  addToCart: () => {},
  increaseQuantity: () => {},
  decreaseQuantity: () => {},
});

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (food: Food) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === food.id);

      if (item) {
        return prev.map((i) =>
          i.id === food.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }

      return [...prev, { ...food, quantity: 1 }];
    });
  };

  const increaseQuantity = (id: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, quantity: i.quantity + 1 } : i
      )
    );
  };

  const decreaseQuantity = (id: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === id ? { ...i, quantity: i.quantity - 1 } : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  return (
    <CartContext.Provider
      value={{
        cart,
        addToCart,
        increaseQuantity,
        decreaseQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};