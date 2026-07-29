/**
 * Kitchen Display System — the chef's screen.
 *
 * Four columns matching the order workflow. New orders appear via Socket.io
 * with no refresh, and each ticket advances with a single tap, because a chef
 * has one free hand and no time to navigate.
 *
 * Tickets age visibly: the longer an order sits, the louder it looks.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { minutesSince, timeAgo } from "../../lib/format";
import type { ApiResponse, KitchenQueue, Order, OrderStatus } from "../../types/api";

/** The next status a ticket moves to, and the label on its button. */
const NEXT_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  PENDING: { next: "CONFIRMED", label: "Accept" },
  CONFIRMED: { next: "PREPARING", label: "Start cooking" },
  PREPARING: { next: "READY", label: "Mark ready" },
  READY: { next: "SERVED", label: "Mark served" },
};

const COLUMNS: { key: keyof Omit<KitchenQueue, "total">; title: string; accent: string }[] = [
  { key: "pending", title: "New", accent: "border-t-amber-400" },
  { key: "confirmed", title: "Accepted", accent: "border-t-blue-400" },
  { key: "preparing", title: "Cooking", accent: "border-t-orange-500" },
  { key: "ready", title: "Ready to serve", accent: "border-t-emerald-500" },
];

/**
 * Age styling.
 *
 * A ticket that has waited 15 minutes must be impossible to miss from across
 * a kitchen, so urgency is colour AND border weight, not a small timestamp.
 */
const ageStyle = (placedAt: string): string => {
  const minutes = minutesSince(placedAt);

  if (minutes >= 15) return "ring-2 ring-red-400 bg-red-50";
  if (minutes >= 8) return "ring-1 ring-amber-300 bg-amber-50";

  return "ring-1 ring-slate-200 bg-white";
};

/**
 * Live cooking countdown.
 *
 * Ticks once a second so the number visibly decreases. It counts down from
 * when the dish started cooking (preparedAt) towards the estimated ready
 * time; once past it, it counts up in red as an overdue timer, because a
 * countdown that simply stops at zero hides the orders that most need
 * attention.
 */
const CookTimer = ({ order }: { order: Order }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const estMinutes = order.estimatedMinutes ?? 15;

  // Cooking started at preparedAt; before that, count against placedAt so the
  // ticket still shows a moving clock while it waits to be started.
  const startedAt = new Date(order.preparedAt ?? order.placedAt).getTime();
  const target = startedAt + estMinutes * 60_000;
  const remainingMs = target - now;
  const overdue = remainingMs < 0;

  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
        overdue
          ? "bg-red-100 text-red-700"
          : remainingMs < 120_000
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-600"
      }`}
      title={overdue ? "Over the estimated cook time" : "Estimated time remaining"}
    >
      {overdue ? "+" : ""}
      {mm}:{ss}
    </span>
  );
};

const Ticket = ({
  order,
  onAdvance,
  isUpdating,
}: {
  order: Order;
  onAdvance: (id: string, next: OrderStatus) => void;
  isUpdating: boolean;
}) => {
  const action = NEXT_ACTION[order.status];
  // The countdown is meaningful once cooking is imminent or underway.
  const showTimer = order.status === "CONFIRMED" || order.status === "PREPARING";

  return (
    <article className={`rounded-xl p-3 ${ageStyle(order.placedAt)}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-black text-slate-900">{order.orderNumber}</span>
        <span className="text-xs text-slate-500">{timeAgo(order.placedAt)}</span>
      </div>

      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">
          {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
        </p>
        {showTimer && <CookTimer order={order} />}
      </div>

      <ul className="mt-2 space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-bold text-slate-900">{item.quantity}×</span>{" "}
            <span className="text-slate-800">{item.foodName}</span>
            {/* Special requests are what the kitchen most often misses, so
                they are highlighted rather than shown as muted small print. */}
            {item.notes && (
              <span className="mt-0.5 block rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-900">
                {item.notes}
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
          Note: {order.notes}
        </p>
      )}

      {action && (
        <Button
          onClick={() => onAdvance(order.id, action.next)}
          disabled={isUpdating}
          className="mt-3 w-full"
        >
          {action.label}
        </Button>
      )}
    </article>
  );
};

const KitchenDisplay = () => {
  const queryClient = useQueryClient();

  const queueQuery = useQuery({
    queryKey: queryKeys.kitchen,
    queryFn: async () => unwrap(await api.get<ApiResponse<KitchenQueue>>("/orders/kitchen")),
    // Socket events drive updates; this only recovers from a missed event.
    refetchInterval: 30_000,
  });

  const advance = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: OrderStatus }) =>
      api.patch(`/orders/${id}/status`, { status: next }),
    // Refetch immediately rather than waiting for the socket round-trip, so
    // the chef sees their own tap land instantly.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });

  if (queueQuery.isLoading) return <Spinner label="Loading kitchen queue" />;

  if (queueQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(queueQuery.error)}
        onRetry={() => void queueQuery.refetch()}
      />
    );
  }

  const queue = queueQuery.data;
  if (!queue) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Kitchen Display</h1>
        <span className="text-sm text-slate-500">{queue.total} open order(s)</span>
      </div>

      {advance.isError && (
        <div className="mb-4">
          <ErrorBox message={getErrorMessage(advance.error)} />
        </div>
      )}

      {queue.total === 0 ? (
        <EmptyState
          title="No open orders"
          hint="New orders appear here automatically the moment a customer places one."
          icon={<span className="text-4xl">👨‍🍳</span>}
        />
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const orders = queue[column.key];

            return (
              <section
                key={column.key}
                className={`rounded-2xl border border-t-4 border-slate-200 bg-slate-50 p-3 ${column.accent}`}
              >
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                    {column.title}
                  </h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {orders.length}
                  </span>
                </header>

                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">Empty</p>
                  ) : (
                    orders.map((order) => (
                      <Ticket
                        key={order.id}
                        order={order}
                        onAdvance={(id, next) => advance.mutate({ id, next })}
                        isUpdating={advance.isPending}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KitchenDisplay;
