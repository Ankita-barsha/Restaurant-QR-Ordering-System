/**
 * WaiterDashboard — Enterprise Waiter Workflow Screen
 *
 * The waiter's complete job in one screen:
 *   1. See orders marked READY (with an alert badge)
 *   2. Mark them SERVED (one tap — food has been delivered)
 *   3. Generate + view the invoice after serving
 *   4. Confirm cash payment OR monitor online payment status
 *
 * Role-scoped: STAFF role gets here by default after login.
 * Real-time: Socket.io WAITER_ORDER_READY event fires instantly.
 * No access to: kitchen workflow, menu management, cancellation.
 *
 * Color system:
 *   Amber  — READY  (waiting to be picked up)
 *   Emerald — SERVED (at the table)
 *   Violet  — PAID
 *   Red ring — Overdue (>15 min in READY state)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import InvoiceSheet from "../../components/InvoiceSheet";
import { EmptyState, ErrorBox, Spinner, StatusBadge } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, minutesSince, timeAgo } from "../../lib/format";
import { getSocket, SOCKET_EVENTS } from "../../lib/socket";
import type { ApiResponse, Order, PaymentStatus } from "../../types/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WaiterTab = "ready" | "served" | "all";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAB_LABELS: { key: WaiterTab; label: string }[] = [
  { key: "ready",  label: "Ready to Serve" },
  { key: "served", label: "Served" },
  { key: "all",    label: "All Open" },
];

/** Age urgency ring for READY orders */
const ageRingClass = (readyAt: string | null): string => {
  if (!readyAt) return "";
  const mins = minutesSince(readyAt);
  if (mins >= 20) return "ring-2 ring-red-500 ring-offset-2 ring-offset-charcoal";
  if (mins >= 10) return "ring-2 ring-amber-400 ring-offset-2 ring-offset-charcoal";
  return "";
};

/** Payment status pill styling */
const PAYMENT_PILL: Record<PaymentStatus, string> = {
  UNPAID:   "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  PAID:     "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  REFUNDED: "bg-slate-500/15 text-ivory-dim ring-1 ring-slate-500/30",
};

// ---------------------------------------------------------------------------
// Alert badge
// ---------------------------------------------------------------------------

const AlertBadge = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center">
      <span className="absolute h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-obsidian">
        {count > 9 ? "9+" : count}
      </span>
    </span>
  ) : null;

// ---------------------------------------------------------------------------
// Cash payment modal
// ---------------------------------------------------------------------------

const CashPaymentModal = ({
  order,
  onClose,
  onConfirmed,
}: {
  order: Order;
  onClose: () => void;
  onConfirmed: () => void;
}) => {
  const [tendered, setTendered] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const total = parseFloat(order.totalAmount);
  const tenderedNum = parseFloat(tendered) || 0;
  const change = tenderedNum - total;
  const canConfirm = tenderedNum >= total;

  const confirmCash = async () => {
    if (!canConfirm) {
      setError(`Amount must be at least ${formatMoney(order.totalAmount)}`);
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      await api.post("/payments/cash", { orderId: order.id });
      setDone(true);
      setTimeout(() => {
        onConfirmed();
        onClose();
      }, 1800);
    } catch (err) {
      setError(getErrorMessage(err));
      setIsPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/80 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-smoke bg-charcoal p-8 shadow-2xl"
        style={{ animation: "waiter-slide-up 0.25s cubic-bezier(.22,.68,0,1.2)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="eyebrow">Cash Payment</p>
            <h2 className="mt-1 font-display text-2xl text-ivory">{order.orderNumber}</h2>
            {order.table && (
              <p className="text-sm text-ivory-dim">Table {order.table.tableNumber}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ivory-faint transition hover:text-ivory"
          >
            ✕
          </button>
        </div>

        {/* Amount due */}
        <div className="mt-6 rounded-xl bg-obsidian p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-ivory-faint">Amount Due</p>
          <p className="mt-1 font-display text-4xl text-slate">{formatMoney(order.totalAmount)}</p>
        </div>

        {done ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-4xl">
              ✓
            </div>
            <p className="text-lg font-bold text-emerald-400">Payment Recorded!</p>
            <p className="text-sm text-ivory-dim">Order is now marked as PAID.</p>
          </div>
        ) : (
          <>
            <div className="mt-6">
              <label className="mb-2 block text-xs uppercase tracking-widest text-ivory-faint">
                Cash Tendered (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={tendered}
                onChange={(e) => { setTendered(e.target.value); setError(null); }}
                placeholder="Enter amount"
                className="w-full rounded-xl border border-smoke bg-obsidian px-4 py-3.5 font-display text-2xl text-ivory placeholder-ivory-faint/40 focus:border-slate focus:outline-none"
                autoFocus
              />
            </div>

            {canConfirm && change >= 0 && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <span className="text-sm font-medium text-emerald-400">Change to return</span>
                <span className="font-display text-xl font-bold text-emerald-400">
                  {formatMoney(change.toFixed(2))}
                </span>
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-smoke py-3 text-sm font-semibold text-ivory-dim transition hover:border-ivory-dim hover:text-ivory"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmCash()}
                disabled={isPending || !canConfirm}
                className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "Recording…" : "✓ Confirm Received"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single order card
// ---------------------------------------------------------------------------

const OrderCard = ({
  order,
  onServe,
  onInvoice,
  onCashPay,
  isServePending,
}: {
  order: Order;
  onServe: (id: string) => void;
  onInvoice: (id: string) => void;
  onCashPay: (order: Order) => void;
  isServePending: boolean;
}) => {
  const isReady  = order.status === "READY";
  const isServed = order.status === "SERVED";
  const isPaid   = order.paymentStatus === "PAID";
  const mins     = order.readyAt ? minutesSince(order.readyAt) : 0;

  return (
    <article
      className={[
        "relative overflow-hidden rounded-2xl border bg-charcoal p-6 shadow-lg transition-all duration-200",
        isReady
          ? "border-amber-400/50 bg-amber-500/5 hover:border-amber-400/80"
          : isServed && isPaid
          ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
          : isServed
          ? "border-blue-500/30 bg-blue-500/5 hover:border-blue-500/50"
          : "border-smoke hover:border-ivory-dim/30",
        ageRingClass(order.readyAt),
      ].join(" ")}
    >
      {/* Color top strip */}
      <div
        className={[
          "absolute inset-x-0 top-0 h-[3px]",
          isReady
            ? "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500"
            : isServed && isPaid
            ? "bg-gradient-to-r from-emerald-400 to-teal-500"
            : isServed
            ? "bg-gradient-to-r from-blue-400 to-cyan-400"
            : "bg-gradient-to-r from-slate-600 to-slate-700",
        ].join(" ")}
      />

      {/* Header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <p className="font-display text-3xl leading-none text-ivory">
            {order.table ? `T-${order.table.tableNumber}` : "Takeaway"}
          </p>
          <p className="mt-0.5 text-xs text-ivory-faint">{order.orderNumber}</p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={order.status} />
          <span
            className={[
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              PAYMENT_PILL[order.paymentStatus],
            ].join(" ")}
          >
            {order.paymentStatus}
          </span>
        </div>
      </div>

      {/* Overdue warning */}
      {isReady && mins >= 10 && (
        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5">
          <span className="text-base">⚠️</span>
          <span className="text-xs font-semibold text-red-400">
            Waiting {mins} min — urgent!
          </span>
        </div>
      )}

      {/* Items list */}
      <ul className="mt-4 space-y-1.5 border-t border-smoke/60 pt-4 text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-2">
            <span className="text-ivory-dim">
              <span className="font-semibold text-slate">{item.quantity}×</span>{" "}
              {item.foodName}
              {item.notes && (
                <span className="ml-1 text-[11px] italic text-ivory-faint">
                  ({item.notes})
                </span>
              )}
            </span>
            <span className="shrink-0 text-ivory-faint">{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-3 rounded-lg bg-obsidian/60 px-3 py-2 text-[11px] italic text-ivory-faint">
          📝 {order.notes}
        </p>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-smoke/50 pt-3">
        <span className="text-xs text-ivory-faint">
          {isReady && order.readyAt ? `Ready ${timeAgo(order.readyAt)}` :
           isServed && order.servedAt ? `Served ${timeAgo(order.servedAt)}` :
           timeAgo(order.placedAt)}
        </span>
        <span className="font-display text-xl font-bold text-slate">
          {formatMoney(order.totalAmount)}
        </span>
      </div>

      {/* CTA actions */}
      <div className="mt-4 flex flex-col gap-2">
        {isReady && (
          <button
            onClick={() => onServe(order.id)}
            disabled={isServePending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-obsidian transition hover:bg-amber-400 active:scale-95 disabled:opacity-50"
          >
            <span className="text-base">🚀</span>
            {isServePending ? "Marking served…" : "Mark Served"}
          </button>
        )}

        {(isServed || isPaid) && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onInvoice(order.id)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-smoke bg-obsidian/60 py-2.5 text-xs font-semibold text-ivory-dim transition hover:border-slate hover:text-ivory"
            >
              🧾 Invoice
            </button>

            {!isPaid ? (
              <button
                onClick={() => onCashPay(order)}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-600 active:scale-95"
              >
                💵 Cash Paid
              </button>
            ) : (
              <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-400">
                ✓ Paid
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

const WaiterDashboard = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WaiterTab>("ready");
  const [alertCount, setAlertCount] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [invoiceOrderId, setInvoiceOrderId] = useState<string | null>(null);
  const [cashOrder, setCashOrder] = useState<Order | null>(null);

  // ---- queries ----

  const ordersQuery = useQuery({
    queryKey: [...queryKeys.orders, "waiter", tab],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "60" });
      if (tab === "ready")  params.set("status", "READY");
      if (tab === "served") params.set("status", "SERVED");
      // tab === "all" → no filter (server returns OPEN orders)
      return unwrap(await api.get<ApiResponse<Order[]>>(`/orders?${params.toString()}`));
    },
    refetchInterval: 20_000,
  });

  const readyCountQuery = useQuery({
    queryKey: [...queryKeys.orders, "waiter-ready-count"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Order[]>>("/orders?status=READY&limit=100")),
    refetchInterval: 15_000,
  });

  const orders = ordersQuery.data ?? [];
  const readyCount = (readyCountQuery.data ?? []).length;

  // ---- real-time ----

  useEffect(() => {
    const socket = getSocket();

    const onOrderReady = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
      setAlertCount((c) => c + 1);
      if (soundOn) {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      }
    };

    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    };

    socket.on(SOCKET_EVENTS.WAITER_ORDER_READY,     onOrderReady);
    socket.on(SOCKET_EVENTS.ORDER_STATUS_CHANGED,   onRefresh);
    socket.on(SOCKET_EVENTS.ORDER_UPDATED,          onRefresh);
    socket.on(SOCKET_EVENTS.ORDER_CANCELLED,        onRefresh);
    socket.on(SOCKET_EVENTS.PAYMENT_STATUS_CHANGED, onRefresh);

    return () => {
      socket.off(SOCKET_EVENTS.WAITER_ORDER_READY,     onOrderReady);
      socket.off(SOCKET_EVENTS.ORDER_STATUS_CHANGED,   onRefresh);
      socket.off(SOCKET_EVENTS.ORDER_UPDATED,          onRefresh);
      socket.off(SOCKET_EVENTS.ORDER_CANCELLED,        onRefresh);
      socket.off(SOCKET_EVENTS.PAYMENT_STATUS_CHANGED, onRefresh);
    };
  }, [queryClient, soundOn]);

  // ---- mutations ----

  const serveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/orders/${id}/serve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });

  // ---- tab handler ----

  const switchTab = (t: WaiterTab) => {
    setTab(t);
    if (t === "ready") setAlertCount(0);
  };

  return (
    <div>
      {/* ---------------------------------------------------------------- header */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">Service Dashboard</p>
            <h1 className="mt-1 font-display text-3xl text-ivory">
              Waiter Panel
              {user?.fullName && (
                <span className="ml-2 text-xl text-ivory-faint">— {user.fullName}</span>
              )}
            </h1>
          </div>

          <button
            onClick={() => setSoundOn((v) => !v)}
            title={soundOn ? "Disable alert sound" : "Enable alert sound"}
            className={[
              "flex items-center gap-2 self-start rounded-xl border px-4 py-2 text-sm font-semibold transition",
              soundOn
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-smoke text-ivory-faint hover:text-ivory",
            ].join(" ")}
          >
            {soundOn ? "🔔 Alerts On" : "🔕 Alerts Off"}
          </button>
        </div>

        {/* Stats strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Ready Now",       value: readyCount,   color: "text-amber-400",   bg: "bg-amber-400/5  border-amber-400/20" },
            { label: "Orders Loaded",   value: orders.length, color: "text-blue-400",    bg: "bg-blue-400/5   border-blue-400/20" },
            { label: "New Alerts",      value: alertCount,   color: "text-red-400",     bg: "bg-red-400/5    border-red-400/20" },
            { label: "Payment Pending", value: orders.filter(o => o.status === "SERVED" && o.paymentStatus === "UNPAID").length, color: "text-violet-400", bg: "bg-violet-400/5 border-violet-400/20" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl border ${bg} px-4 py-3`}>
              <p className="text-[11px] uppercase tracking-wider text-ivory-faint">{label}</p>
              <p className={`mt-1 font-display text-2xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------------------- tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-smoke bg-charcoal p-1">
        {TAB_LABELS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            className={[
              "relative flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
              tab === key
                ? "bg-obsidian text-ivory shadow"
                : "text-ivory-dim hover:text-ivory",
            ].join(" ")}
          >
            {label}
            {key === "ready" && <AlertBadge count={alertCount} />}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- errors */}
      {serveMutation.isError && (
        <div className="mb-5 max-w-lg">
          <ErrorBox message={getErrorMessage(serveMutation.error)} />
        </div>
      )}

      {/* ---------------------------------------------------------------- order grid */}
      {ordersQuery.isPending ? (
        <Spinner label="Loading orders" />
      ) : ordersQuery.isError ? (
        <ErrorBox
          message={getErrorMessage(ordersQuery.error)}
          onRetry={() => void ordersQuery.refetch()}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          title={
            tab === "ready"
              ? "No orders ready to serve"
              : tab === "served"
              ? "No served orders"
              : "No open orders"
          }
          hint={
            tab === "ready"
              ? "Orders appear here instantly when the kitchen marks them ready. An alert will sound."
              : tab === "served"
              ? "Served orders appear here. Generate invoice and collect payment."
              : "All active orders will appear here."
          }
          icon={
            <span className="mb-3 text-5xl opacity-30">
              {tab === "ready" ? "🍽️" : "✓"}
            </span>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onServe={(id) => serveMutation.mutate(id)}
              onInvoice={setInvoiceOrderId}
              onCashPay={setCashOrder}
              isServePending={
                serveMutation.isPending && serveMutation.variables === order.id
              }
            />
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- invoice modal */}
      {invoiceOrderId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-obsidian/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInvoiceOrderId(null);
          }}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-charcoal shadow-2xl"
            style={{
              animation: "waiter-slide-up 0.25s cubic-bezier(.22,.68,0,1.2)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-smoke bg-charcoal px-6 py-4">
              <p className="font-semibold text-ivory">Tax Invoice</p>
              <button
                onClick={() => setInvoiceOrderId(null)}
                className="rounded-lg p-1.5 text-ivory-faint transition hover:text-ivory"
              >
                ✕
              </button>
            </div>
            <div className="px-6 pb-6">
              <InvoiceSheet source={{ orderId: invoiceOrderId }} onClose={() => setInvoiceOrderId(null)} />
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- cash modal */}
      {cashOrder && (
        <CashPaymentModal
          order={cashOrder}
          onClose={() => setCashOrder(null)}
          onConfirmed={() => {
            setCashOrder(null);
            void queryClient.invalidateQueries({ queryKey: queryKeys.orders });
          }}
        />
      )}

      {/* ---------------------------------------------------------------- animations */}
      <style>{`
        @keyframes waiter-slide-up {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
};

export default WaiterDashboard;
