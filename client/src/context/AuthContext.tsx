/**
 * Staff authentication.
 *
 * Holds the logged-in user and exposes a permission check the UI uses to hide
 * what the caller cannot do. NOTE: hiding a button is a convenience, never a
 * security control — the server enforces the same permission on every route.
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

import { api, setAccessToken, setSessionExpiredHandler, unwrap } from "../lib/api";
import { disconnectSocket, reconnectSocket } from "../lib/socket";
import type { ApiResponse, AuthUser } from "../types/api";

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the initial silent-refresh attempt finishes. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Restores the session on page load.
   *
   * The access token lives in memory, so a refresh loses it. The httpOnly
   * cookie survives, so one refresh call silently restores the session —
   * which is why reloading the dashboard does not log staff out.
   */
  useEffect(() => {
    const restore = async () => {
      try {
        const response = await api.post<ApiResponse<{ accessToken: string }>>(
          "/auth/refresh"
        );

        setAccessToken(response.data.data.accessToken);

        const me = await api.get<ApiResponse<{ user: AuthUser }>>("/auth/me");
        setUser(unwrap(me).user);

        // Reconnect so the socket handshake carries the restored token and
        // the user rejoins their role rooms.
        reconnectSocket();
      } catch {
        // No valid cookie: an anonymous visitor, not an error.
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void restore();
  }, []);

  // The API layer calls this when a refresh fails mid-session.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setAccessToken(null);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await api.post<
      ApiResponse<{ user: AuthUser; accessToken: string }>
    >("/auth/login", { email, password });

    const { user: loggedIn, accessToken } = unwrap(response);

    setAccessToken(accessToken);
    setUser(loggedIn);

    // The socket authenticates at handshake, so it must reconnect to pick up
    // the new token and join the kitchen/admin rooms.
    reconnectSocket();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // Cleared even if the request fails: the user asked to leave.
      setAccessToken(null);
      setUser(null);
      disconnectSocket();
    }
  }, []);

  /** True when the user holds every listed permission. */
  const can = useCallback(
    (...permissions: string[]) => {
      if (!user) return false;
      // Mirrors the server: SUPER_ADMIN bypasses permission checks.
      if (user.role.name === "SUPER_ADMIN") return true;

      return permissions.every((permission) => user.permissions.includes(permission));
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, isLoading, login, logout, can }),
    [user, isLoading, login, logout, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
};
