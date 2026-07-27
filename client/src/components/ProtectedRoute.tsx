/**
 * Route guard.
 *
 * Blocks unauthenticated users and, optionally, anyone missing a permission.
 * A guard in the browser is a usability feature — the API enforces the same
 * rules, so bypassing this reveals nothing.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../context/auth";
import { Spinner } from "./ui";

const ProtectedRoute = ({
  children,
  permission,
}: {
  children: ReactNode;
  /** Permission required to view the route. */
  permission?: string;
}) => {
  const { user, isLoading, can } = useAuth();
  const location = useLocation();

  // The session is restored asynchronously on page load. Redirecting during
  // that window would bounce a signed-in user to the login screen on every
  // refresh.
  if (isLoading) return <Spinner label="Checking your session" />;

  if (!user) {
    // The attempted path is remembered so login can return them to it.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (permission && !can(permission)) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-semibold text-amber-900">You do not have access</h2>
        <p className="mt-1 text-sm text-amber-700">
          Your role ({user.role.name}) is missing the{" "}
          <code className="rounded bg-amber-100 px-1">{permission}</code> permission.
          Ask an administrator if you need it.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
