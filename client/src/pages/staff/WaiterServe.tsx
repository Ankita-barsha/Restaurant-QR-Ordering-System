/**
 * Waiter serving screen.
 *
 * The waiter sees only orders that are READY, and nothing else — this is the
 * whole of their job in the app. To serve one, they ask the diner for the
 * four-character pickup code and enter it. The server refuses a wrong code,
 * which is what stops food reaching the wrong table.
 *
 * Live: new READY orders appear via Socket.IO with no refresh, because the
 * shell mounts useLiveOrders() and this query is invalidated on every order
 * event.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { LuxeButton, LuxeEmpty, LuxeError, LuxeLoader } from "../../components/luxe";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, timeAgo } from "../../lib/format";
import type { ApiResponse, Order } from "../../types/api";

const WaiterServe = () => {
  const queryClient = useQueryClient();

  // Which order's code entry is open, and the code being typed.
  const [serving, setServing] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const readyQuery = useQuery({
    queryKey: [...queryKeys.orders, "ready"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Order[]>>("/orders?status=READY&limit=100")),
    // Socket events drive updates; this only recovers a missed event.
    refetchInterval: 30_000,
  });

  const serve = useMutation({
    mutationFn: async ({ id, pickup }: { id: string; pickup: string }) =>
      api.post(`/orders/${id}/serve`, { code: pickup }),
    onSuccess: () => {
      setServing(null);
      setCode("");
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
          {orders.length} order{orders.length === 1 ? "" : "s"} waiting · ask the
          guest for their code before serving
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
              <div className="flex items-baseline justify-between">
                <span className="font-display text-2xl text-ivory">
                  {order.orderNumber}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-ivory-faint">
                  {timeAgo(order.readyAt ?? order.placedAt)}
                </span>
              </div>

              <p className="mt-1 text-sm text-gold">
                {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
              </p>

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

              <p className="mt-4 text-right font-display text-xl text-gold">
                {formatMoney(order.totalAmount)}
              </p>

              {serving === order.id ? (
                <div className="mt-5 border-t border-smoke pt-5">
                  <label className="eyebrow block text-center">
                    Enter the guest's code
                  </label>

                  <input
                    autoFocus
                    value={code}
                    onChange={(event) => setCode(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && code.length >= 4) {
                        serve.mutate({ id: order.id, pickup: code });
                      }
                    }}
                    maxLength={4}
                    placeholder="A92K"
                    inputMode="text"
                    className="mt-3 w-full rounded-xl border border-smoke bg-obsidian py-3 text-center font-display text-3xl tracking-[0.3em] text-ivory placeholder:text-ivory-faint focus:border-gold/50 focus:outline-none"
                  />

                  <div className="mt-4 flex gap-2">
                    <LuxeButton
                      variant="ghost"
                      onClick={() => {
                        setServing(null);
                        setCode("");
                      }}
                    >
                      Cancel
                    </LuxeButton>
                    <LuxeButton
                      className="flex-1"
                      disabled={code.length < 4 || serve.isPending}
                      onClick={() => serve.mutate({ id: order.id, pickup: code })}
                    >
                      {serve.isPending ? "Verifying…" : "Confirm & serve"}
                    </LuxeButton>
                  </div>
                </div>
              ) : (
                <LuxeButton
                  className="mt-5 w-full"
                  onClick={() => {
                    setServing(order.id);
                    setCode("");
                  }}
                >
                  Serve order
                </LuxeButton>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default WaiterServe;
