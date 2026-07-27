/**
 * The favourites context object and its hook.
 *
 * Split from FavouritesContext.tsx so that file exports only components — see
 * the note in ./auth.
 */

import { createContext, useContext } from "react";

export interface FavouritesContextValue {
  favourites: string[];
  isFavourite: (foodId: string) => boolean;
  toggle: (foodId: string) => void;
  clear: () => void;
  count: number;
}

export const FavouritesContext = createContext<FavouritesContextValue | null>(null);

export const useFavourites = (): FavouritesContextValue => {
  const context = useContext(FavouritesContext);

  if (!context) {
    throw new Error("useFavourites must be used inside <FavouritesProvider>");
  }

  return context;
};
