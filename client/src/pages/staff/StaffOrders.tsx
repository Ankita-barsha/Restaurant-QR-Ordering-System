/**
 * Staff order list — view every order and assist with it.
 *
 * Waiting staff use this to advance orders, add a forgotten item to a running
 * tab, record payment and cancel. Each action is gated by permission, so the
 * same screen serves a waiter and a manager while showing each only what they
 * may do.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import InvoiceSheet from "../../components/InvoiceSheet";
import { KitchenTicketPrint } from "../../components/KitchenTicketPrint";
import { Button, EmptyState, ErrorBox, Spinner, StatusBadge } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, timeAgo } from "../../lib/format";
import type { ApiResponse, Order, OrderStatus } from "../../types/api";

const NEXT_ACTION: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  PENDING: { next: "CONFIRMED", label: "Accept" },
  CONFIRMED: { next: "PREPARING", label: "Start cooking" },
  PREPARING: { next: "READY", label: "Mark ready" },
  READY: { next: "SERVED", label: "Mark served" },
};

const FILTERS: { label: string; value: OrderStatus | "OPEN" }[] = [
  { label: "Open", value: "OPEN" },
  { label: "Pending", value: "PENDING" },
  { label: "Preparing", value: "PREPARING" },
  { label: "Ready", value: "READY" },
  { label: "Served", value: "SERVED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const StaffOrders = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<OrderStatus | "OPEN">("OPEN");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [invoiceFor, setInvoiceFor] = useState<string | null>(null);
  const [kotOrder, setKotOrder] = useState<Order | null>(null);

  const ordersQuery = useQuery({
    queryKey: [...queryKeys.orders, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });

      if (filter !== "OPEN") params.set("status", filter);

      return unwrap(await api.get<ApiResponse<Order[]>>(`/orders?${params.toString()}`));
    },
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
  };

  const advance = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: OrderStatus }) =>
      api.patch(`/orders/${id}/status`, { status: next }),
    onSuccess: invalidate,
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) =>
      api.patch(`/orders/${id}/payment`, { paymentStatus: "PAID", paymentMethod: "CASH" }),
    onSuccess: invalidate,
  });

  const cancelOrder = useMutation({
    mutationFn: async ({ id, why }: { id: string; why: string }) =>
      api.post(`/orders/${id}/cancel`, { reason: why }),
    onSuccess: () => {
      setCancelling(null);
      setReason("");
      invalidate();
    },
  });

  if (ordersQuery.isLoading) return <Spinner label="Loading orders" />;

  if (ordersQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(ordersQuery.error)}
        onRetry={() => void ordersQuery.refetch()}
      />
    );
  }

  const orders = (ordersQuery.data ?? []).filter((order) =>
    filter === "OPEN" ? !["SERVED", "CANCELLED"].includes(order.status) : true
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ivory font-display">Orders Queue</h1>
        <p className="text-sm text-ivory-dim mt-0.5">Live order management and billing pass</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`flex min-h-10 shrink-0 items-center rounded-full px-4 text-xs font-bold uppercase tracking-wider transition ${
              filter === option.value
                ? "bg-gold text-obsidian shadow-sm"
                : "bg-graphite border border-smoke text-ivory-dim hover:border-gold/50 hover:text-ivory"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(advance.isError || markPaid.isError || cancelOrder.isError) && (
        <div>
          <ErrorBox
            message={getErrorMessage(
              advance.error ?? markPaid.error ?? cancelOrder.error
            )}
          />
        </div>
      )}

      {orders.length === 0 ? (
        <div>
          <EmptyState title="No orders here" hint="New orders appear automatically as customers place them." />
        </div>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => {
            const action = NEXT_ACTION[order.status];

            return (
              <article
                key={order.id}
                className="rounded-2xl border border-smoke bg-charcoal p-4 shadow-sm hover:border-gold/30 transition"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-bold text-ivory font-mono text-base">{order.orderNumber}</span>
                  <StatusBadge status={order.status} />
                  <span className="text-sm text-gold font-medium">
                    {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
                  </span>
                  <span className="text-xs text-ivory-faint">{timeAgo(order.placedAt)}</span>

                  <span className="ml-auto font-bold text-gold text-base">
                    {formatMoney(order.totalAmount)}
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      order.paymentStatus === "PAID"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-graphite text-ivory-dim border border-smoke"
                    }`}
                  >
                    {order.paymentStatus}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 border-t border-smoke/60 pt-2 text-sm text-ivory">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <span className="font-bold text-gold">{item.quantity}×</span> {item.foodName}
                      {item.notes && (
                        <span className="text-xs text-gold/90 font-medium"> — Note: {item.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>

                {order.handledBy && (
                  <p className="mt-2 text-xs text-ivory-faint">
                    Handled by {order.handledBy.fullName}
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2 pt-2 border-t border-smoke/40">
                  {action && can("order:updateStatus") && (
                    <Button
                      onClick={() => advance.mutate({ id: order.id, next: action.next })}
                      disabled={advance.isPending}
                      className="font-bold uppercase tracking-wider text-xs"
                    >
                      {action.label}
                    </Button>
                  )}

                  {order.paymentStatus === "UNPAID" &&
                    order.status !== "CANCELLED" &&
                    can("order:updateStatus") && (
                      <Button
                        variant="secondary"
                        onClick={() => markPaid.mutate(order.id)}
                        disabled={markPaid.isPending}
                        className="font-bold text-xs"
                      >
                        Mark paid
                      </Button>
                    )}

                  <Button variant="secondary" onClick={() => setKotOrder(order)} className="font-bold text-xs">
                    🖨️ KOT
                  </Button>

                  <Button variant="secondary" onClick={() => setInvoiceFor(order.id)} className="font-bold text-xs">
                    Invoice
                  </Button>

                  {!["SERVED", "CANCELLED"].includes(order.status) &&
                    can("order:cancel") && (
                      <Button
                        variant="danger"
                        onClick={() => setCancelling(order.id)}
                        disabled={cancelOrder.isPending}
                        className="font-bold text-xs"
                      >
                        Cancel
                      </Button>
                    )}
                </div>

                {cancelling === order.id && (
                  <div className="mt-3 rounded-xl bg-ember/15 border border-ember/40 p-3">
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Why is this order being cancelled?"
                      className="w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory outline-none focus:border-ember"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="danger"
                        disabled={!reason || cancelOrder.isPending}
                        onClick={() =>
                          cancelOrder.mutate({ id: order.id, why: reason })
                        }
                      >
                        Confirm cancel
                      </Button>
                      <Button variant="ghost" onClick={() => setCancelling(null)}>
                        Keep order
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {invoiceFor && (
        <InvoiceSheet
          source={{ orderId: invoiceFor }}
          onClose={() => setInvoiceFor(null)}
        />
      )}

      {kotOrder && (
        <KitchenTicketPrint
          order={kotOrder}
          onClose={() => setKotOrder(null)}
        />
      )}
    </div>
  );
};

export default StaffOrders;
