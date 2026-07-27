/**
 * The auth context object and its hook.
 *
 * Split from AuthContext.tsx because that file may export only components.
 * Vite's Fast Refresh can hot-swap a module of components; the moment one also
 * exports a hook, editing it forces a full page reload and loses the state you
 * were debugging. Keeping the two apart is what buys the fast edit loop.
 */

import { createContext, useContext } from "react";

import type { AuthUser } from "../types/api";

export interface AuthContextValue {
  user: AuthUser | null;
  /** True until the initial silent-refresh attempt finishes. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Reads the session.
 *
 * Throws rather than returning null outside a provider: a component reading a
 * missing session would silently render as though nobody were signed in, which
 * looks like a login bug and is much harder to trace than an explicit error.
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
};
