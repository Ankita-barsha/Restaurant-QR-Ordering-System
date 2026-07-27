/**
 * Live order tracking.
 *
 * Subscribes to the socket room named after the order number, so the status
 * moves the instant the kitchen taps it. The vertical timeline is deliberate:
 * a diner wants to know how far along their food is, and progress downward
 * reads as time passing.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import DemoCheckout from "../../components/DemoCheckout";
import { LuxeButton, LuxeError, LuxeLoader } from "../../components/luxe";
import { LAST_ORDER_KEY } from "../../context/cart";
import {
  queryKeys,
  useLiveOrderTracking,
  useSocketStatus,
} from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, formatTime } from "../../lib/format";
import type { ApiResponse, OrderStatus, TrackedOrder } from "../../types/api";

const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: "PENDING", label: "Received", hint: "Your order is with us" },
  { status: "CONFIRMED", label: "Accepted", hint: "The kitchen has it" },
  { status: "PREPARING", label: "In the pass", hint: "Being cooked now" },
  { status: "READY", label: "Ready", hint: "Coming to your table" },
  { status: "SERVED", label: "Served", hint: "Enjoy your meal" },
];

/**
 * Landing for /track with no token in the URL.
 *
 * There is deliberately no "type your order number" form here any more. An
 * order number identifies an order but does not prove you placed it, and this
 * page shows the pickup code — so tracking is authorised by the tracking
 * token instead, which the diner receives once when they order.
 *
 * The token is remembered in sessionStorage so that closing the tab, hitting
 * back, or reloading still recovers the order. sessionStorage rather than
 * localStorage for the same reason the table session uses it: the next diner
 * on a shared device must not inherit it.
 */
const TrackLookup = () => {
  const navigate = useNavigate();
  const lastToken = sessionStorage.getItem(LAST_ORDER_KEY);

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian px-6 pt-20">
      <div className="w-full max-w-sm text-center">
        <p className="eyebrow">Order status</p>
        <h1 className="mt-3 text-4xl leading-tight text-ivory">Track your order</h1>
        <div className="rule-fade mx-auto mt-5 h-px w-24" />

        {lastToken ? (
          <>
            <p className="mt-6 text-[13px] leading-relaxed text-ivory-faint">
              Pick up where you left off with your most recent order.
            </p>

            <LuxeButton
              className="mt-7 w-full"
              onClick={() => navigate(`/track/${lastToken}`)}
            >
              View my order
            </LuxeButton>
          </>
        ) : (
          <p className="mt-6 text-[13px] leading-relaxed text-ivory-faint">
            Your tracking link opens automatically when you place an order.
            If you have lost it, any member of staff can look your order up
            from the number on your receipt.
          </p>
        )}
      </div>
    </div>
  );
};

const TrackOrder = () => {
  const { token } = useParams();
  const connected = useSocketStatus();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paidReceipt, setPaidReceipt] = useState<string | null>(null);

  useLiveOrderTracking(token);

  const orderQuery = useQuery({
    queryKey: queryKeys.track(token ?? ""),
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<TrackedOrder>>(`/orders/track/${token}`)),
    enabled: Boolean(token),
    // Safety net only — the socket is the primary path. This recovers from an
    // event missed while the phone was asleep or off Wi-Fi.
    refetchInterval: 30_000,
  });

  if (!token) return <TrackLookup />;

  if (orderQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian">
        <LuxeLoader label="Finding your order" />
      </div>
    );
  }

  if (orderQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian px-6">
        <div className="w-full max-w-md">
          <LuxeError message={getErrorMessage(orderQuery.error)} />
        </div>
      </div>
    );
  }

  const order = orderQuery.data;
  if (!order) return null;

  const cancelled = order.status === "CANCELLED";
  const currentStep = STEPS.findIndex((step) => step.status === order.status);

  const timestamps: Partial<Record<OrderStatus, string | null>> = {
    PENDING: order.placedAt,
    CONFIRMED: order.confirmedAt,
    PREPARING: order.preparedAt,
    READY: order.readyAt,
    SERVED: order.servedAt,
  };

  return (
    <div className="min-h-screen bg-obsidian px-6 pb-20 pt-28">
      <div className="mx-auto max-w-md">
        <header className="text-center">
          <p className="eyebrow">
            {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
          </p>

          <h1 className="font-display mt-3 text-5xl leading-none text-ivory">
            {order.orderNumber}
          </h1>

          <div className="mt-5 flex items-center justify-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "animate-pulse bg-gold" : "bg-ivory-faint"
              }`}
            />
            <span className="text-[10px] uppercase tracking-[0.24em] text-ivory-faint">
              {connected ? "Live" : "Reconnecting"}
            </span>
          </div>
        </header>

        {/* Pickup code — the diner shows this to the waiter, who must enter it
            before the order can be served. Hidden once served, since it has
            done its job and need not linger on screen. */}
        {order.verificationCode && !cancelled && order.status !== "SERVED" && (
          <div className="glass rounded-luxe mt-10 p-7 text-center">
            <p className="eyebrow">Your pickup code</p>
            <p className="font-display mt-3 text-6xl tracking-[0.3em] text-gold-gradient">
              {order.verificationCode}
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-ivory-faint">
              Show this to your waiter when the food arrives. It makes sure your
              order reaches your table and no one else's.
            </p>
          </div>
        )}

        {cancelled ? (
          <div className="glass rounded-luxe mt-12 p-8 text-center">
            <p className="eyebrow text-ember">Cancelled</p>
            <p className="mt-3 text-[15px] leading-relaxed text-ivory-dim">
              This order was cancelled. Please speak to a member of staff if
              that is unexpected.
            </p>
          </div>
        ) : (
          <ol className="mt-14">
            {STEPS.map((step, index) => {
              const done = index <= currentStep;
              const active = index === currentStep;
              const at = timestamps[step.status];

              return (
                <li key={step.status} className="flex gap-5">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[11px] transition-all duration-700 ${
                        done
                          ? "border-gold bg-gold text-obsidian"
                          : "border-smoke text-ivory-faint"
                      } ${active ? "ring-4 ring-gold/15" : ""}`}
                    >
                      {done ? "✓" : index + 1}
                    </span>

                    {index < STEPS.length - 1 && (
                      <span
                        className={`h-14 w-px transition-colors duration-700 ${
                          done ? "bg-gold/40" : "bg-smoke"
                        }`}
                      />
                    )}
                  </div>

                  <div className="pb-5">
                    <p
                      className={`font-display text-2xl leading-tight ${
                        done ? "text-ivory" : "text-ivory-faint"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ivory-faint">{step.hint}</p>
                    {at && (
                      <p className="mt-1 text-[11px] tracking-wide text-gold/70">
                        {formatTime(at)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <section className="glass rounded-luxe mt-8 p-7">
          <p className="eyebrow">Your order</p>

          <ul className="mt-5 space-y-4">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-4 text-sm">
                <span className="text-ivory-dim">
                  <span className="text-gold">{item.quantity}×</span> {item.foodName}
                  {item.notes && (
                    <span className="mt-0.5 block text-[11px] text-ivory-faint">
                      {item.notes}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-ivory">{formatMoney(item.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <div className="rule-fade my-5 h-px" />

          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Total</span>
            <span className="font-display text-3xl text-gold">
              {formatMoney(order.totalAmount)}
            </span>
          </div>

          {/* Payment: pay online now, or settle at the table. */}
          {!cancelled && (
            <div className="mt-6">
              {order.paymentStatus === "PAID" ? (
                <p className="flex items-center justify-center gap-2 rounded-full border border-emerald-500/40 py-3 text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Paid
                </p>
              ) : (
                <>
                  <LuxeButton className="w-full" onClick={() => setCheckoutOpen(true)}>
                    Pay online
                  </LuxeButton>
                  <p className="mt-3 text-center text-[11px] text-ivory-faint">
                    Or pay by cash at the table.
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {checkoutOpen && (
        <DemoCheckout
          trackingToken={order.trackingToken}
          amount={order.totalAmount}
          onClose={() => setCheckoutOpen(false)}
          onPaid={(receipt) => {
            setCheckoutOpen(false);
            setPaidReceipt(receipt);
            void orderQuery.refetch();
          }}
        />
      )}

      {paidReceipt && (
        <div
          className="animate-fade fixed inset-0 z-50 flex items-center justify-center bg-obsidian/85 p-6"
          onClick={() => setPaidReceipt(null)}
          role="presentation"
        >
          <div className="animate-rise max-w-sm rounded-luxe border border-smoke bg-charcoal p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/50">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mt-5 text-3xl text-ivory">Payment received</h2>
            <p className="mt-2 text-[13px] text-ivory-faint">
              Receipt {paidReceipt ?? ""}. Thank you — enjoy your meal.
            </p>
            <LuxeButton className="mt-6 w-full" onClick={() => setPaidReceipt(null)}>
              Done
            </LuxeButton>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackOrder;
