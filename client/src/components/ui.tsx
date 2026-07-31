/**
 * Shared UI Primitives — Unified Dark Design System for Staff Screens (#18)
 *
 * Provides theme-consistent building blocks for all staff screens, aligning
 * with the dark obsidian/charcoal shell and gold/amber accents.
 */

import type { ReactNode } from "react";
import type { OrderStatus } from "../types/api";

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-ivory-dim">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-smoke border-t-amber-500" />
    <span className="text-sm font-medium">{label}…</span>
  </div>
);

export const ErrorBox = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-300 shadow-lg">
    <p className="font-medium">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
      >
        Try again
      </button>
    )}
  </div>
);

export const EmptyState = ({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-smoke bg-charcoal/40 py-14 text-center">
    {icon}
    <p className="font-semibold text-ivory">{title}</p>
    {hint && <p className="max-w-sm text-sm text-ivory-dim">{hint}</p>}
  </div>
);

/** Colour-codes an order status consistently everywhere it appears in dark mode. */
const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  CONFIRMED: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  PREPARING: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  READY: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  SERVED: "bg-slate-500/15 text-white-300 ring-slate-500/30",
  CANCELLED: "bg-red-500/15 text-red-300 ring-red-500/30",
};

export const StatusBadge = ({ status }: { status: OrderStatus }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
  >
    {status}
  </span>
);

/** Live/offline pill, so a kitchen tablet shows when it has lost the server. */
export const ConnectionDot = ({ connected }: { connected: boolean }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
      connected ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
    }`}
  >
    <span
      className={`h-2 w-2 rounded-full ${
        connected ? "animate-pulse bg-emerald-500" : "bg-red-500"
      }`}
    />
    {connected ? "Live" : "Offline"}
  </span>
);

export const Button = ({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
  className?: string;
}) => {
  const variants = {
    primary:
      "bg-gradient-to-r from-amber-500 to-orange-500 text-obsidian font-bold hover:brightness-110 disabled:opacity-50 shadow-md",
    secondary:
      "border border-smoke bg-graphite text-ivory hover:bg-charcoal disabled:text-ivory-faint",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
    ghost: "text-ivory-dim hover:bg-graphite hover:text-ivory",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Card = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div className={`rounded-2xl border border-smoke/70 bg-charcoal p-4 sm:p-5 text-ivory shadow-lg ${className}`}>
    {children}
  </div>
);
