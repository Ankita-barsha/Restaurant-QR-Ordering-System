/**
 * Waiter serving screen.
 *
 * The waiter sees only orders that are READY, and nothing else — this is the
 * whole of their job in the app. Each card says the one thing they need to act
 * on it: which table it goes to, and what is on the tray.
 *
 * There is deliberately no code to ask the guest for. The pickup code this
 * screen used to demand added a step to every service and told the waiter
 * nothing the table number did not already say, so serving is now a single
 * tap.
 *
 * Live: new READY orders appear via Socket.IO with no refresh, because the
 * shell mounts useLiveOrders() and this query is invalidated on every order
 * event.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { LuxeButton, LuxeEmpty, LuxeError, LuxeLoader } from "../../components/luxe";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, timeAgo } from "../../lib/format";
import type { ApiResponse, Order } from "../../types/api";

const WaiterServe = () => {
  const queryClient = useQueryClient();

  const readyQuery = useQuery({
    queryKey: [...queryKeys.orders, "ready"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Order[]>>("/orders?status=READY&limit=100")),
    // Socket events drive updates; this only recovers a missed event.
    refetchInterval: 30_000,
  });

  const serve = useMutation({
    mutationFn: async (id: string) => api.post(`/orders/${id}/serve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });

  if (readyQuery.isLoading) return <LuxeLoader label="Loading orders to serve" />;

  if (readyQuery.isError) {
    return (
      <LuxeError
        message={getErrorMessage(readyQuery.error)}
        onRetry={() => void readyQuery.refetch()}
      />
    );
  }

  const orders = readyQuery.data ?? [];

  return (
    <div>
      <div className="mb-8 text-center">
        <p className="eyebrow">Service</p>
        <h1 className="mt-2 text-4xl text-ivory">Ready to serve</h1>
        <div className="rule-fade mx-auto mt-4 h-px w-28" />
        <p className="mt-4 text-sm text-ivory-faint">
          {orders.length} order{orders.length === 1 ? "" : "s"} waiting · take each
          one to its table and mark it served
        </p>
      </div>

      {serve.isError && (
        <div className="mx-auto mb-6 max-w-md">
          <LuxeError message={getErrorMessage(serve.error)} />
        </div>
      )}

      {orders.length === 0 ? (
        <LuxeEmpty
          title="Nothing to serve right now"
          hint="Orders appear here the moment the kitchen marks them ready."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <article
              key={order.id}
              className="rounded-luxe border border-smoke bg-charcoal p-6"
            >
              {/* The table number is the whole point of this card, so it is set
                  as the largest thing on it — read at a glance, on the move. */}
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl leading-none text-gold">
                  {order.table ? order.table.tableNumber : "Takeaway"}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-ivory-faint">
                  {timeAgo(order.readyAt ?? order.placedAt)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2.5">
                <span className="text-sm text-ivory-dim">{order.orderNumber}</span>
                <span className="rounded-full border border-gold/30 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gold">
                  {order.status}
                </span>
              </div>

              <ul className="mt-4 space-y-1.5 border-t border-smoke pt-4 text-sm text-ivory-dim">
                {order.items.map((item) => (
                  <li key={item.id}>
                    <span className="text-gold">{item.quantity}×</span> {item.foodName}
                    {item.notes && (
                      <span className="block text-[11px] text-ivory-faint">
                        {item.notes}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {order.notes && (
                <p className="mt-3 text-[11px] leading-relaxed text-ivory-faint">
                  Note: {order.notes}
                </p>
              )}

              <p className="mt-4 text-right font-display text-xl text-gold">
                {formatMoney(order.totalAmount)}
              </p>

              <LuxeButton
                className="mt-5 w-full"
                disabled={serve.isPending}
                onClick={() => serve.mutate(order.id)}
              >
                {serve.isPending ? "Serving…" : "Mark served"}
              </LuxeButton>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default WaiterServe;
