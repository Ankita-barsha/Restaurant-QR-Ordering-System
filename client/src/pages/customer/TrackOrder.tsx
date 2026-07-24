/**
 * Live order tracking — /track/:orderNumber
 *
 * Subscribes to the socket room named after the order number, so the status
 * updates the instant the kitchen taps it. No polling, no refresh.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, ErrorBox, Spinner } from "../../components/ui";
import { queryKeys, useLiveOrderTracking, useSocketStatus } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, formatTime } from "../../lib/format";
import type { ApiResponse, OrderStatus, TrackedOrder } from "../../types/api";

/** The journey a diner sees. CANCELLED is handled separately. */
const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "PENDING", label: "Order placed", hint: "We have received your order" },
  { status: "CONFIRMED", label: "Confirmed", hint: "The restaurant accepted it" },
  { status: "PREPARING", label: "Preparing", hint: "The kitchen is cooking" },
  { status: "READY", label: "Ready", hint: "Your food is ready" },
  { status: "SERVED", label: "Served", hint: "Enjoy your meal" },
];

/** Prompt for an order number when the route has none. */
const TrackLookup = () => {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold text-slate-900">Track your order</h1>
      <p className="mt-1 text-sm text-slate-500">
        Enter the order number shown when you placed your order.
      </p>

      <input
        value={value}
        onChange={(event) => setValue(event.target.value.toUpperCase())}
        placeholder="ORD-000123"
        className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-orange-500"
      />

      <Button
        onClick={() => value && navigate(`/track/${value}`)}
        disabled={!value}
        className="mt-3 w-full"
      >
        Track order
      </Button>
    </div>
  );
};

const TrackOrder = () => {
  const { orderNumber } = useParams();
  const connected = useSocketStatus();

  // Joins the per-order room and invalidates on every status push.
  useLiveOrderTracking(orderNumber);

  const orderQuery = useQuery({
    queryKey: queryKeys.track(orderNumber ?? ""),
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<TrackedOrder>>(`/orders/track/${orderNumber}`)),
    enabled: Boolean(orderNumber),
    // A safety net only. The socket is the primary update path; this catches
    // the case where an event was missed while the tablet was offline.
    refetchInterval: 30_000,
  });

  if (!orderNumber) return <TrackLookup />;

  if (orderQuery.isLoading) return <Spinner label="Finding your order" />;

  if (orderQuery.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox message={getErrorMessage(orderQuery.error)} />
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) return null;

  const isCancelled = order.status === "CANCELLED";
  const currentStep = STEPS.findIndex((step) => step.status === order.status);

  const timestamps: Partial<Record<OrderStatus, string | null>> = {
    PENDING: order.placedAt,
    CONFIRMED: order.confirmedAt,
    PREPARING: order.preparedAt,
    READY: order.readyAt,
    SERVED: order.servedAt,
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">Order</p>
          <h1 className="text-2xl font-black text-slate-900">{order.orderNumber}</h1>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            connected ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "animate-pulse bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {connected ? "Live" : "Reconnecting"}
        </span>
      </div>

      {order.table && (
        <p className="mt-1 text-sm text-slate-500">Table {order.table.tableNumber}</p>
      )}

      {isCancelled ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-lg font-bold text-red-700">Order cancelled</p>
          <p className="mt-1 text-sm text-red-600">
            Please speak to a staff member if this is unexpected.
          </p>
        </div>
      ) : (
        <ol className="mt-6 space-y-1">
          {STEPS.map((step, index) => {
            const done = index <= currentStep;
            const active = index === currentStep;
            const at = timestamps[step.status];

            return (
              <li key={step.status} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      done ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-400"
                    } ${active ? "ring-4 ring-orange-100" : ""}`}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  {index < STEPS.length - 1 && (
                    <span
                      className={`h-10 w-0.5 ${done ? "bg-orange-300" : "bg-slate-200"}`}
                    />
                  )}
                </div>

                <div className="pb-4">
                  <p
                    className={`font-semibold ${
                      done ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-slate-500">{step.hint}</p>
                  {at && <p className="mt-0.5 text-xs text-slate-400">{formatTime(at)}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Items</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span className="text-slate-700">
                {item.quantity} × {item.foodName}
                {item.notes && (
                  <span className="block text-xs text-slate-400">{item.notes}</span>
                )}
              </span>
              <span className="shrink-0 font-medium">{formatMoney(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-bold">
          <span>Total</span>
          <span>{formatMoney(order.totalAmount)}</span>
        </div>
      </div>
    </div>
  );
};

export default TrackOrder;
