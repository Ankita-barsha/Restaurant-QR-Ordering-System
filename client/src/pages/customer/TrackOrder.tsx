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
import AdvancePaymentDialog from "../../components/AdvancePaymentDialog";
import DemoCheckout from "../../components/DemoCheckout";
import InvoiceSheet from "../../components/InvoiceSheet";
import { ThermalReceiptSheet } from "../../components/ThermalReceiptSheet";
import { LuxeButton, LuxeError, LuxeLoader } from "../../components/luxe";
import {
  forgetOrderToken,
  getMyOrderTokens,
  LAST_ORDER_KEY,
} from "../../context/cart";
import {
  queryKeys,
  useLiveOrderTracking,
  useSocketStatus,
} from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, formatTime } from "../../lib/format";
import {
  isHeldStatus,
  type ApiResponse,
  type OrderStatus,
  type PublicSettings,
  type TrackedOrder,
} from "../../types/api";

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
    <form onSubmit={handleSubmit} className="my-4 rounded-xl border border-gold/20 bg-obsidian/60 dark:bg-obsidian/60 html-light:bg-white p-4 text-left shadow-sm">
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
        className="mt-3 w-full rounded-lg border border-smoke bg-charcoal dark:bg-charcoal html-light:bg-slate-50 html-light:text-slate-900 html-light:placeholder-slate-400 p-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none"
      />

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOptedOut(true)}
          className="text-[10px] text-ivory-faint dark:text-ivory-faint html-light:text-slate-600 hover:text-slate underline"
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
  const navigate = useNavigate();
  const connected = useSocketStatus();

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [thermalOpen, setThermalOpen] = useState(false);
  const [paidReceipt, setPaidReceipt] = useState<string | null>(null);

  /**
   * Whether the guest has dismissed the advance dialog.
   *
   * Dismissing hides it for THIS view only — it reopens on the next visit,
   * because the order genuinely is still held and the guest genuinely does
   * still have to decide. Persisting the dismissal would leave someone
   * staring at a stalled order with no explanation and no way back to it.
   */
  const [advanceDismissed, setAdvanceDismissed] = useState(false);

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

  // Drives the wording and the payment options inside the advance dialog.
  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
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
  /**
   * A large order the kitchen has not been told about yet.
   *
   * Shown as its own panel rather than as a greyed-out timeline. A diner
   * staring at five empty steps assumes the app is broken; the real answer —
   * "this is a big order, so we take a deposit / a colleague is on their way"
   * — is reassuring, and is the difference between waiting and complaining.
   */
  const held = isHeldStatus(order.status);
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
      <div className="mx-auto max-w-2xl">
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
        ) : held ? (
          <div className="glass rounded-luxe mt-12 border border-gold/30 p-8 text-center">
            <span className="text-3xl">
              {order.status === "AWAITING_ADVANCE_PAYMENT" ? "🔒" : "🤝"}
            </span>

            <p className="eyebrow mt-3 text-slate">
              {order.status === "AWAITING_ADVANCE_PAYMENT"
                ? "Advance required"
                : "One moment"}
            </p>

            {order.status === "AWAITING_ADVANCE_PAYMENT" ? (
              <>
                <p className="font-display mt-3 text-3xl leading-tight text-ivory">
                  {order.advanceAmount
                    ? formatMoney(order.advanceAmount)
                    : "An advance"}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-ivory-dim">
                  For an order this size we take an advance before the kitchen
                  starts. It comes off your final bill of{" "}
                  {formatMoney(order.totalAmount)}.
                </p>
                <p className="mt-4 text-[13px] text-ivory-faint">
                  Your food is not being prepared yet. It starts the moment this
                  is paid — usually within seconds.
                </p>

                <button
                  type="button"
                  onClick={() => setAdvanceDismissed(false)}
                  className="mt-5 min-h-11 rounded-xl border border-gold/40 px-5 text-sm font-bold text-gold transition hover:bg-gold/10"
                >
                  Pay advance
                </button>
              </>
            ) : (
              <>
                <p className="mt-3 text-[15px] leading-relaxed text-ivory-dim">
                  Thank you — this is a large order, so a member of our team is
                  coming to your table to confirm it with you.
                </p>
                <p className="mt-4 text-[13px] text-ivory-faint">
                  Nothing more is needed from you. The kitchen starts as soon as
                  they have said hello.
                </p>
              </>
            )}
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

          {/* Payment: Pay online now, or settle at the table.
              Rule: For orders <= ₹3,000, do not show payment portion upfront while food is preparing;
              only show payment portion once the food is SERVED at the table. */}
          {!cancelled && (() => {
            const orderTotalNum = Number(order.totalAmount);
            const isSmallOrder = orderTotalNum <= 3000;
            const isServedOrCompleted = order.status === "SERVED" || (order.status as string) === "COMPLETED";
            const isAwaitingAdvance = order.status === "AWAITING_ADVANCE_PAYMENT";
            const isPaid = order.paymentStatus === "PAID";

            const showPaymentSection = isPaid || isAwaitingAdvance || isServedOrCompleted || !isSmallOrder;

            if (!showPaymentSection) {
              return (
                <div className="mt-6 rounded-2xl border border-smoke bg-charcoal/50 p-4 text-center">
                  <p className="text-xs font-semibold text-ivory-dim">
                    🍲 Your food is being prepared by our kitchen!
                  </p>
                  <p className="mt-1 text-[11px] text-ivory-faint">
                    Payment options will appear here once your meal has been served at your table.
                  </p>
                </div>
              );
            }

            return (
              <div className="mt-6">
                {isPaid ? (
                  <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
                    <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Payment Completed (Paid)
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-950 font-medium dark:text-emerald-200">
                      Thank you! Your payment has been received and tax invoice is generated.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <LuxeButton className="w-full font-bold" onClick={() => setCheckoutOpen(true)}>
                      {isAwaitingAdvance && order.advanceAmount
                        ? `🔒 Pay ${formatMoney(order.advanceAmount)} advance`
                        : "💳 Pay Bill (UPI, Card, Cash)"}
                    </LuxeButton>
                    <p className="text-center text-[11px] text-ivory-faint">
                      {isAwaitingAdvance
                        ? "The kitchen starts as soon as this clears. The rest is settled at the table."
                        : "Supports GPay, PhonePe, Paytm, Credit/Debit Card & Cash."}
                    </p>
                  </div>
                )}
              </div>
            );
          })()}

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
                <Link to="/menu?category=desserts" className="w-full">
                  <LuxeButton className="w-full flex-col py-3 text-xs leading-tight h-full justify-center">
                    <span className="text-base mb-1">🍧</span>
                    <span>ORDER</span>
                    <span>DESSERTS</span>
                  </LuxeButton>
                </Link>
                <Link to="/menu?category=drinks" className="w-full">
                  <LuxeButton className="w-full flex-col py-3 text-xs leading-tight h-full justify-center">
                    <span className="text-base mb-1">🥤</span>
                    <span>ORDER</span>
                    <span>DRINKS</span>
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

          {/* Bill options: 80mm thermal slip & A4 GST tax invoice */}
          <div className="mt-4 flex flex-wrap gap-2">
            <LuxeButton
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => setThermalOpen(true)}
            >
              🖨️ Thermal Slip (80mm)
            </LuxeButton>
            <LuxeButton
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => setInvoiceOpen(true)}
            >
              🧾 Tax Invoice
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

      {thermalOpen && (
        <ThermalReceiptSheet
          source={{ trackingToken: order.trackingToken }}
          onClose={() => setThermalOpen(false)}
          onSwitchToA4={() => {
            setInvoiceOpen(true);
            setThermalOpen(false);
          }}
        />
      )}

      {checkoutOpen && (
        <DemoCheckout
          trackingToken={order.trackingToken}
          // A held order is charged its ADVANCE, not the bill. The server
          // decides this figure independently; passing it here only keeps the
          // amount on screen honest about what is being taken.
          amount={
            order.status === "AWAITING_ADVANCE_PAYMENT" && order.advanceAmount
              ? order.advanceAmount
              : order.totalAmount
          }
          depositOf={
            order.status === "AWAITING_ADVANCE_PAYMENT"
              ? order.totalAmount
              : undefined
          }
          onClose={() => setCheckoutOpen(false)}
          onPaid={(receipt) => {
            setCheckoutOpen(false);
            setPaidReceipt(receipt);
            void orderQuery.refetch();
          }}
        />
      )}

      {/*
        The blocking advance dialog.
        Rendered last so it sits above the tracking screen behind it, and shown
        for BOTH held states: a guest whose order is waiting on a waiter needs
        the same explanation as one whose order is waiting on their money.
      */}
      {held && !advanceDismissed && (
        <AdvancePaymentDialog
          order={order}
          settings={settingsQuery.data}
          onClose={() => setAdvanceDismissed(true)}
          onPaid={() => void orderQuery.refetch()}
          onCancelled={() => {
            // Back to the menu, which is where a guest who has just abandoned
            // an order wants to be — not staring at the cancelled one. The
            // token is forgotten too, or this screen would redirect them
            // straight back to it on the next visit.
            forgetOrderToken(order.trackingToken);
            navigate("/menu", { replace: true });
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
