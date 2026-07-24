/**
 * Staff order list — view every order and assist with it.
 *
 * Waiting staff use this to advance orders, add a forgotten item to a running
 * tab, record payment and cancel. Each action is gated by permission, so the
 * same screen serves a waiter and a manager while showing each only what they
 * may do.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, EmptyState, ErrorBox, Spinner, StatusBadge } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
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

  // "Open" is a client-side view over the same list, so switching filters
  // does not require a different endpoint.
  const orders = (ordersQuery.data ?? []).filter((order) =>
    filter === "OPEN" ? !["SERVED", "CANCELLED"].includes(order.status) : true
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Orders</h1>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === option.value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(advance.isError || markPaid.isError || cancelOrder.isError) && (
        <div className="mt-4">
          <ErrorBox
            message={getErrorMessage(
              advance.error ?? markPaid.error ?? cancelOrder.error
            )}
          />
        </div>
      )}

      {orders.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No orders here" hint="New orders appear automatically." />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {orders.map((order) => {
            const action = NEXT_ACTION[order.status];

            return (
              <article
                key={order.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-black text-slate-900">{order.orderNumber}</span>
                  <StatusBadge status={order.status} />
                  <span className="text-sm text-slate-500">
                    {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
                  </span>
                  <span className="text-xs text-slate-400">{timeAgo(order.placedAt)}</span>

                  <span className="ml-auto font-bold text-slate-900">
                    {formatMoney(order.totalAmount)}
                  </span>

                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      order.paymentStatus === "PAID"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {order.paymentStatus}
                  </span>
                </div>

                <ul className="mt-2 text-sm text-slate-700">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity} × {item.foodName}
                      {item.notes && (
                        <span className="text-xs text-slate-400"> — {item.notes}</span>
                      )}
                    </li>
                  ))}
                </ul>

                {order.handledBy && (
                  <p className="mt-2 text-xs text-slate-400">
                    Handled by {order.handledBy.fullName}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {action && can("order:updateStatus") && (
                    <Button
                      onClick={() => advance.mutate({ id: order.id, next: action.next })}
                      disabled={advance.isPending}
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
                      >
                        Mark paid
                      </Button>
                    )}

                  {!["SERVED", "CANCELLED"].includes(order.status) &&
                    can("order:cancel") && (
                      <Button
                        variant="danger"
                        onClick={() => setCancelling(order.id)}
                        disabled={cancelOrder.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                </div>

                {/* The server requires a reason, so the UI collects one rather
                    than letting the request fail. */}
                {cancelling === order.id && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3">
                    <input
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Why is this being cancelled?"
                      className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm outline-none"
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
    </div>
  );
};

export default StaffOrders;
