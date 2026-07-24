/**
 * Staff login.
 *
 * After a successful login the user is routed to the screen their ROLE is
 * built around: a chef lands on the Kitchen Display, an admin on the
 * dashboard. Sending everyone to the same page would make the first action of
 * every shift a navigation.
 */

import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Button, ErrorBox } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../lib/api";
import type { AuthUser } from "../../types/api";

/** Chooses the landing screen from what the user can actually do. */
export const homeRouteFor = (user: AuthUser): string => {
  const isSuperAdmin = user.role.name === "SUPER_ADMIN";
  const has = (permission: string) =>
    isSuperAdmin || user.permissions.includes(permission);

  if (user.role.name === "KITCHEN") return "/kitchen";
  if (has("dashboard:view")) return "/admin";
  if (has("kitchen:access")) return "/kitchen";
  if (has("order:read")) return "/staff";

  return "/staff";
};

const Login = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) return <Navigate to={homeRouteFor(user)} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      // The redirect happens through the <Navigate> above once user is set.
      navigate("/", { replace: true });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-bold text-slate-900">Staff sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kitchen, staff and admin access.
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-orange-500"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-orange-500"
          />
        </label>

        {error && (
          <div className="mt-4">
            <ErrorBox message={error} />
          </div>
        )}

        <Button type="submit" disabled={isSubmitting} className="mt-6 w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
};

export default Login;
