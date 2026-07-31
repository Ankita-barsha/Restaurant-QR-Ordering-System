/**
 * Kitchen Display System — the chef's screen.
 *
 * Four columns matching the order workflow. New orders appear via Socket.io
 * with no refresh, and each ticket advances with a single tap, because a chef
 * has one free hand and no time to navigate.
 *
 * Tickets age visibly: the longer an order sits, the louder it looks.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { KitchenTicketPrint } from "../../components/KitchenTicketPrint";
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
  { key: "preparing", title: "Cooking", accent: "border-t-amber-500" },
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

  if (minutes >= 15) return "ring-2 ring-ember bg-ember/15 text-ivory border border-ember/40";
  if (minutes >= 8) return "ring-1 ring-gold bg-gold/10 text-ivory border border-gold/40";

  return "border border-smoke bg-charcoal text-ivory";
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

  const startedAt = new Date(order.preparedAt ?? order.placedAt).getTime();
  const target = startedAt + estMinutes * 60_000;
  const remainingMs = target - now;
  const overdue = remainingMs < 0;

  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
        overdue
          ? "bg-ember/20 text-ember border border-ember/40"
          : remainingMs < 120_000
            ? "bg-gold/20 text-gold border border-gold/40"
            : "bg-graphite text-ivory-dim border border-smoke"
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
  onPrintKOT,
  isUpdating,
}: {
  order: Order;
  onAdvance: (id: string, next: OrderStatus) => void;
  onPrintKOT: (order: Order) => void;
  isUpdating: boolean;
}) => {
  const action = NEXT_ACTION[order.status];
  const showTimer = order.status === "CONFIRMED" || order.status === "PREPARING";

  return (
    <article className={`rounded-xl p-3 shadow-md ${ageStyle(order.placedAt)}`}>
      <div className="flex items-baseline justify-between">
        <span className="font-bold text-ivory font-mono text-base">{order.orderNumber}</span>
        <span className="text-xs text-ivory-dim font-medium">{timeAgo(order.placedAt)}</span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gold">
          {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
        </p>
        {showTimer && <CookTimer order={order} />}
      </div>

      <ul className="mt-2.5 space-y-1.5 border-t border-smoke/60 pt-2">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm">
            <span className="font-bold text-gold">{item.quantity}×</span>{" "}
            <span className="text-ivory font-medium">{item.foodName}</span>
            {item.notes && (
              <span className="mt-1 block rounded bg-gold/20 border border-gold/40 px-2 py-0.5 text-xs font-semibold text-gold">
                {item.notes}
              </span>
            )}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 rounded bg-graphite border border-smoke px-2 py-1 text-xs text-ivory-dim">
          Note: {order.notes}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {action && (
          <Button
            onClick={() => onAdvance(order.id, action.next)}
            disabled={isUpdating}
            className="flex-1 font-bold uppercase tracking-wider text-xs"
          >
            {action.label}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => onPrintKOT(order)}
          className="shrink-0 text-xs px-2.5 font-bold"
        >
          🖨️ KOT
        </Button>
      </div>
    </article>
  );
};

const KitchenDisplay = () => {
  const queryClient = useQueryClient();
  const [kotOrder, setKotOrder] = useState<Order | null>(null);

  const queueQuery = useQuery({
    queryKey: queryKeys.kitchen,
    queryFn: async () => unwrap(await api.get<ApiResponse<KitchenQueue>>("/orders/kitchen")),
    refetchInterval: 30_000,
  });

  const advance = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: OrderStatus }) =>
      api.patch(`/orders/${id}/status`, { status: next }),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Kitchen Display System</h1>
          <p className="text-xs text-ivory-dim mt-0.5 font-medium">Real-time KOT order dispatch pass</p>
        </div>
        <span className="text-sm text-gold font-bold bg-graphite border border-smoke px-3 py-1 rounded-full">
          {queue.total} open order(s)
        </span>
      </div>

      {advance.isError && (
        <div>
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
                className={`rounded-2xl border border-t-4 border-smoke bg-graphite/40 p-3 shadow-sm ${column.accent}`}
              >
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gold">
                    {column.title}
                  </h2>
                  <span className="rounded-full bg-charcoal border border-smoke px-2.5 py-0.5 text-xs font-bold text-ivory">
                    {orders.length}
                  </span>
                </header>

                <div className="space-y-3">
                  {orders.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ivory-faint italic">Empty pass</p>
                  ) : (
                    orders.map((order) => (
                      <Ticket
                        key={order.id}
                        order={order}
                        onAdvance={(id, next) => advance.mutate({ id, next })}
                        onPrintKOT={(ord) => setKotOrder(ord)}
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

      {kotOrder && (
        <KitchenTicketPrint order={kotOrder} onClose={() => setKotOrder(null)} />
      )}
    </div>
  );
};

export default KitchenDisplay;
