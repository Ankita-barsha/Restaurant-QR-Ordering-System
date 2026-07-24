/**
 * HTTP client.
 *
 * One axios instance for the whole app, with two interceptors:
 *
 *   REQUEST  — attaches the access token.
 *   RESPONSE — on 401, silently refreshes and retries the failed request.
 *
 * The refresh flow is what makes a 15-minute access token usable: staff work
 * long shifts and must never be bounced to the login screen mid-service.
 */

import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";

import { config } from "../config/env";
import type { ApiResponse } from "../types/api";

export const api = axios.create({
  baseURL: `${config.apiUrl}/api`,
  // Sends the httpOnly refresh cookie. Without this the browser omits it and
  // every refresh fails with 401.
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Access token storage
//
// Held in memory, NOT localStorage. A token in localStorage is readable by any
// script on the page, so a single XSS bug leaks the session. Losing it on
// refresh is fine: the httpOnly refresh cookie silently mints a new one.
// ---------------------------------------------------------------------------

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

api.interceptors.request.use((request: InternalAxiosRequestConfig) => {
  if (accessToken) {
    request.headers.Authorization = `Bearer ${accessToken}`;
  }

  return request;
});

// ---------------------------------------------------------------------------
// Refresh-on-401
// ---------------------------------------------------------------------------

/** Marks a request that has already been retried, so a loop cannot form. */
interface RetriableRequest extends AxiosRequestConfig {
  _retried?: boolean;
}

/**
 * In-flight refresh, shared by every request that 401s at the same moment.
 *
 * Without this, a dashboard firing six parallel queries would trigger six
 * refreshes. Since refresh tokens ROTATE server-side, the first would succeed
 * and the other five would present an already-revoked token and log the user
 * out. Sharing one promise is what makes rotation safe on the client.
 */
let refreshPromise: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  refreshPromise ??= (async () => {
    try {
      const response = await axios.post<ApiResponse<{ accessToken: string }>>(
        `${config.apiUrl}/api/auth/refresh`,
        {},
        { withCredentials: true }
      );

      const token = response.data.data.accessToken;
      setAccessToken(token);

      return token;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      // Cleared so the NEXT 401 starts a fresh attempt.
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/** Notifies the app that the session ended and a login is required. */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler | null = null;

export const setSessionExpiredHandler = (handler: SessionExpiredHandler): void => {
  onSessionExpired = handler;
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetriableRequest | undefined;

    const isAuthEndpoint =
      request?.url?.includes("/auth/login") || request?.url?.includes("/auth/refresh");

    // Only a 401 on a normal request is retried. A 401 from login means bad
    // credentials, and retrying the refresh endpoint itself would loop.
    if (error.response?.status === 401 && request && !request._retried && !isAuthEndpoint) {
      request._retried = true;

      const token = await refreshAccessToken();

      if (token) {
        request.headers = { ...request.headers, Authorization: `Bearer ${token}` };
        return api.request(request);
      }

      onSessionExpired?.();
    }

    return Promise.reject(error);
  }
);

/**
 * Extracts a human-readable message from an API error.
 *
 * The server returns { success, message, details }. Falling back to
 * error.message would surface "Request failed with status code 409" instead of
 * "This table already exists".
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { message?: string; details?: { field: string; message: string }[] }
      | undefined;

    if (data?.details?.length) {
      return data.details.map((detail) => detail.message).join(", ");
    }

    if (data?.message) {
      return data.message;
    }

    if (error.code === "ERR_NETWORK") {
      return "Cannot reach the server. Is the API running?";
    }
  }

  return error instanceof Error ? error.message : "Something went wrong";
};

/** Unwraps the { success, data } envelope so callers work with the payload. */
export const unwrap = <T>(response: { data: ApiResponse<T> }): T => response.data.data;
