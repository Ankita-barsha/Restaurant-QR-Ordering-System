/**
 * Shared UI primitives.
 *
 * Small, unstyled-by-default building blocks so every screen looks like one
 * system without a component library.
 */

import type { ReactNode } from "react";

import type { OrderStatus } from "../types/api";

export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-orange-500" />
    <span className="text-sm">{label}…</span>
  </div>
);

export const ErrorBox = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p className="font-medium">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
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
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-14 text-center">
    {icon}
    <p className="font-medium text-slate-700">{title}</p>
    {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
  </div>
);

/** Colour-codes an order status consistently everywhere it appears. */
const STATUS_STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-blue-100 text-blue-800 ring-blue-200",
  PREPARING: "bg-orange-100 text-orange-800 ring-orange-200",
  READY: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  SERVED: "bg-slate-100 text-slate-600 ring-slate-200",
  CANCELLED: "bg-red-100 text-red-700 ring-red-200",
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
      connected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
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
    primary: "bg-orange-500 text-white hover:bg-orange-600 disabled:bg-orange-300",
    secondary:
      "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
    ghost: "text-slate-600 hover:bg-slate-100",
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
  <div className={`rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>
    {children}
  </div>
);
