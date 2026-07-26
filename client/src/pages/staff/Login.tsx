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

import { LuxeButton, LuxeError } from "../../components/luxe";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../lib/api";
import type { AuthUser } from "../../types/api";

/** Chooses the landing screen from what the user can actually do. */
export const homeRouteFor = (user: AuthUser): string => {
  const isSuperAdmin = user.role.name === "SUPER_ADMIN";
  const has = (permission: string) =>
    isSuperAdmin || user.permissions.includes(permission);

  // Each role lands on the single screen its job is built around.
  if (user.role.name === "KITCHEN") return "/kitchen";
  if (user.role.name === "STAFF") return "/serve";
  if (has("dashboard:view")) return "/admin";
  if (has("kitchen:access")) return "/kitchen";
  if (has("order:read")) return "/staff";

  return "/serve";
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
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-4">
      <form
        onSubmit={handleSubmit}
        className="glass rounded-luxe w-full max-w-sm p-9"
      >
        <p className="eyebrow">Bite me Bistro</p>
        <h1 className="mt-3 text-3xl leading-tight text-ivory">Staff sign in</h1>
        <div className="rule-fade mt-4 h-px w-20" />
        <p className="mt-4 text-[13px] text-ivory-faint">
          Kitchen, floor and administration.
        </p>

        <label className="mt-7 block text-[11px] uppercase tracking-[0.18em] text-ivory-faint">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="username"
            className="mt-2 w-full rounded-xl border border-smoke bg-charcoal px-4 py-3 text-sm text-ivory outline-none transition-colors focus:border-gold/50"
          />
        </label>

        <label className="mt-5 block text-[11px] uppercase tracking-[0.18em] text-ivory-faint">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-smoke bg-charcoal px-4 py-3 text-sm text-ivory outline-none transition-colors focus:border-gold/50"
          />
        </label>

        {error && (
          <div className="mt-5">
            <LuxeError message={error} />
          </div>
        )}

        <LuxeButton type="submit" disabled={isSubmitting} className="mt-8 w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </LuxeButton>
      </form>
    </div>
  );
};

export default Login;
