/**
 * Favourite dishes.
 *
 * Stored in localStorage on the device rather than against an account: QR
 * diners have no account, and requiring one to save a dish would be a worse
 * trade than losing the list when they clear their browser.
 *
 * localStorage, not sessionStorage — unlike the table session, a favourite
 * should survive closing the tab and be there on the next visit.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { FavouritesContext } from "./favourites";

const STORAGE_KEY = "qr.favourites";

export const FavouritesProvider = ({ children }: { children: ReactNode }) => {
  const [favourites, setFavourites] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];

      // Guards against a hand-edited or corrupted value crashing the app on
      // load — a stored string would otherwise break every .includes call.
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(favourites));
    } catch {
      // Private browsing can refuse writes. Losing the list is acceptable;
      // crashing the menu over it is not.
    }
  }, [favourites]);

  const toggle = useCallback((foodId: string) => {
    setFavourites((previous) =>
      previous.includes(foodId)
        ? previous.filter((id) => id !== foodId)
        : [...previous, foodId]
    );
  }, []);

  const isFavourite = useCallback(
    (foodId: string) => favourites.includes(foodId),
    [favourites]
  );

  const clear = useCallback(() => setFavourites([]), []);

  const value = useMemo(
    () => ({ favourites, isFavourite, toggle, clear, count: favourites.length }),
    [favourites, isFavourite, toggle, clear]
  );

  return (
    <FavouritesContext.Provider value={value}>{children}</FavouritesContext.Provider>
  );
};

