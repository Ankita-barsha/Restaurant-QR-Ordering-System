import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { CartProvider } from "./context/CartContext.tsx";
import { FavouritesProvider } from "./context/FavouritesContext.tsx";
import "./index.css";

/**
 * React Query configuration.
 *
 * staleTime is generous because Socket.io drives freshness: an event
 * invalidates exactly the affected query. Aggressive time-based refetching on
 * top of that would just duplicate work.
 *
 * 401s are not retried — the axios interceptor already refreshes the token
 * and replays the request once, so retrying here would repeat a call that has
 * genuinely failed.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;

        if (status === 401 || status === 403 || status === 404) return false;

        return failureCount < 2;
      },
    },
  },
});

import ErrorBoundary from "./components/ErrorBoundary.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* AuthProvider wraps CartProvider: the cart never needs auth, but the
            staff shell needs the session available above every route. */}
        <AuthProvider>
          <CartProvider>
            <FavouritesProvider>
              <App />
            </FavouritesProvider>
          </CartProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
