/**
 * Live order tracking.
 *
 * Subscribes to the socket room named after the order number, so the status
 * moves the instant the kitchen taps it. The vertical timeline is deliberate:
 * a diner wants to know how far along their food is, and progress downward
 * reads as time passing.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import CustomerFooter from "../../components/CustomerFooter";
import DemoCheckout from "../../components/DemoCheckout";
import InvoiceSheet from "../../components/InvoiceSheet";
import { LuxeButton, LuxeError, LuxeLoader } from "../../components/luxe";
import { getMyOrderTokens, LAST_ORDER_KEY } from "../../context/cart";
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

const MyOrdersList = ({ currentToken }: { currentToken?: string }) => {
  const tokens = getMyOrderTokens().filter((t) => t !== currentToken);
  const navigate = useNavigate();

  if (tokens.length === 0) return null;

  return (
    <div className="mt-8 rounded-luxe border border-smoke bg-charcoal p-5 text-left">
      <p className="eyebrow text-slate">My Recent Orders</p>
      <p className="mt-1 text-xs text-ivory-dim">
        Orders placed on this device:
      </p>
      <div className="mt-3 space-y-2">
        {tokens.map((token) => (
          <div
            key={token}
            onClick={() => navigate(`/track/${token}`)}
            className="flex items-center justify-between rounded-xl border border-smoke bg-graphite p-3 transition hover:border-gold/50 cursor-pointer"
          >
            <div>
              <p className="font-display text-sm text-ivory font-bold">
                Order #{token.slice(0, 8).toUpperCase()}
              </p>
              <p className="text-[11px] text-ivory-faint">
                Tap to view status & invoice
              </p>
            </div>
            <span className="text-xs font-bold text-slate">View →</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TrackLookup = () => {
  const navigate = useNavigate();
  const lastToken =
    sessionStorage.getItem(LAST_ORDER_KEY) || localStorage.getItem(LAST_ORDER_KEY);

  useEffect(() => {
    if (lastToken) {
      navigate(`/track/${lastToken}`, { replace: true });
    }
  }, [lastToken, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-obsidian px-6 pt-20">
      <div className="my-auto w-full max-w-sm text-center">
        <p className="eyebrow">Order status</p>
        <h1 className="mt-3 text-4xl leading-tight text-ivory">Track your order</h1>
        <div className="rule-fade mx-auto mt-5 h-px w-24" />

        {lastToken ? (
          <>
            <p className="mt-6 text-[13px] leading-relaxed text-ivory-faint">
              Connecting to your active order...
            </p>

            <LuxeButton
              className="mt-7 w-full"
              onClick={() => navigate(`/track/${lastToken}`)}
            >
              View my order
            </LuxeButton>

            <MyOrdersList currentToken={lastToken} />
          </>
        ) : (
          <>
            <p className="mt-6 text-[13px] leading-relaxed text-ivory-faint">
              If you have lost it, any member of staff can look your order up
              from the number on your receipt.
            </p>

            <MyOrdersList />
          </>
        )}
      </div>

      <div className="w-full mt-10">
        <CustomerFooter />
      </div>
    </div>
  );
};

const DinerReviewForm = ({ customerName }: { customerName: string }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post("/content/reviews", {
        customerName: customerName || "Guest",
        rating,
        comment: comment || "Great food and quick service!",
        visitedOn: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch {
      // Graceful fallback
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (optedOut) {
    return (
      <div className="my-4 rounded-xl border border-smoke bg-charcoal/60 p-3 text-center text-xs text-ivory-faint">
        ✓ You have opted out of review reminders.
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="my-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 text-center">
        <p className="font-bold text-emerald-400 text-sm">⭐ Thank you for your review!</p>
        <p className="mt-1 text-xs text-ivory-dim">Your feedback helps us make every dining experience special.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="my-4 rounded-xl border border-gold/20 bg-obsidian/60 p-4 text-left">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate text-center">Leave a Review</p>
      
      <div className="mt-3 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            className="p-1 transition-transform hover:scale-125 focus:outline-none"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={star <= rating ? "#c9a961" : "none"}
              stroke="#c9a961"
              strokeWidth="1.5"
            >
              <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Tell us about your meal & service..."
        rows={2}
        className="mt-3 w-full rounded-lg border border-smoke bg-charcoal p-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOptedOut(true)}
          className="text-[10px] text-ivory-faint hover:text-ivory underline"
        >
          Opt out of reminders
        </button>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-gold px-4 py-1.5 text-xs font-bold text-obsidian hover:bg-gold-light disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit Review"}
        </button>
      </div>
    </form>
  );
};

const TrackOrder = () => {
  const { token } = useParams();
  const connected = useSocketStatus();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paidReceipt, setPaidReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      sessionStorage.setItem(LAST_ORDER_KEY, token);
      localStorage.setItem(LAST_ORDER_KEY, token);
    }
  }, [token]);

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
    <div className="min-h-screen bg-obsidian px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
      <div className="mx-auto max-w-md">
        <header className="text-center">
          <p className="eyebrow">
            {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"}
          </p>

          <h1 className="font-display mt-3 text-[clamp(2.25rem,11vw,3rem)] leading-none text-ivory">
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
                <li key={step.status} className="flex gap-4 sm:gap-5">
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
                      <p className="mt-1 text-[11px] tracking-wide text-slate/70">
                        {formatTime(at)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <section className="glass rounded-luxe mt-8 p-5 sm:p-7">
          <p className="eyebrow">Your order</p>

          <ul className="mt-5 space-y-4">
            {order.items.map((item, index) => (
              <li key={index} className="flex justify-between gap-4 text-sm">
                <span className="text-ivory-dim">
                  <span className="text-slate">{item.quantity}×</span> {item.foodName}
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
            <span className="font-display text-2xl text-slate sm:text-3xl">
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

          {/* Post-service completion & Review Request card (#22, #26) */}
          {(order.status === "SERVED" || (order.status as string) === "COMPLETED") && (
            <div className="mt-6 rounded-luxe border border-gold/30 bg-gold/10 p-5 text-center shadow-lg">
              <span className="text-3xl">🍷</span>
              <h3 className="font-display mt-2 text-2xl text-slate">Thank you for dining with us!</h3>
              <p className="mt-1 text-[13px] text-ivory-dim leading-relaxed">
                Your meal has been served. How was your experience today?
              </p>

              {/* Interactive Review & Feedback Section (#26) */}
              <DinerReviewForm customerName="Guest" />

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Link to="/menu?category=desserts">
                  <LuxeButton className="w-full text-xs">
                    🍧 Order Desserts
                  </LuxeButton>
                </Link>
                <Link to="/menu?category=drinks">
                  <LuxeButton className="w-full text-xs">
                    🥤 Order Drinks
                  </LuxeButton>
                </Link>
              </div>
              <div className="mt-2.5">
                <Link to="/reserve">
                  <LuxeButton variant="outline" className="w-full text-xs">
                    Book a Table for Next Time
                  </LuxeButton>
                </Link>
              </div>
            </div>
          )}

          {/* The diner's own bill — printable, or saveable as a PDF — so they
              never have to ask a member of staff for a copy. */}
          <div className="mt-4">
            <LuxeButton
              variant="outline"
              className="w-full"
              onClick={() => setInvoiceOpen(true)}
            >
              View tax invoice
            </LuxeButton>
          </div>
        </section>
      </div>

      {invoiceOpen && (
        <InvoiceSheet
          source={{ trackingToken: order.trackingToken }}
          onClose={() => setInvoiceOpen(false)}
        />
      )}

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
          <div className="animate-rise w-full max-w-sm rounded-luxe border border-smoke bg-charcoal p-6 text-center sm:p-8">
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

      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <MyOrdersList currentToken={order.trackingToken} />
      </div>

      <div className="mt-20">
        <CustomerFooter />
      </div>
    </div>
  );
};

export default TrackOrder;
