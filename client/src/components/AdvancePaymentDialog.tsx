/**
 * The advance-payment dialog.
 *
 * Shown to a diner the moment a high-value order is held, and it BLOCKS: the
 * order does not reach the kitchen until they either pay the advance or walk
 * away from it. That is the whole point — nothing is cooked while this is on
 * screen, so nothing is lost if they change their mind.
 *
 * TONE. The copy explains a policy, it never implies suspicion. A guest
 * ordering ₹6,000 of food is the restaurant's best customer of the evening,
 * and being told they look like a fraud risk is how you lose them. The
 * default wording talks about reserving kitchen resources and reducing waste;
 * the restaurant can replace it from Admin → Settings, and the fallback here
 * means a house that never touches that field still reads as finished.
 *
 * It is deliberately NOT dismissible by clicking away. A guest who taps the
 * backdrop and finds their order silently un-cancelled and un-paid has learnt
 * nothing about what they must do next.
 */

import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { api, getErrorMessage, unwrap } from "../lib/api";
import { formatMoney } from "../lib/format";
import { fromMinor, toMinor } from "../lib/money";
import type { ApiResponse, PublicSettings, TrackedOrder } from "../types/api";
import DemoCheckout from "./DemoCheckout";
import { LuxeButton, LuxeError } from "./luxe";

/** Used when the restaurant has not written its own message. */
const HOUSE_MESSAGE =
  "For the safety and convenience of all our guests, orders above this value " +
  "require an advance payment before preparation begins. This helps us reserve " +
  "kitchen resources, reduce food waste, and provide faster, more efficient " +
  "service. The remaining balance can be paid after your meal. Thank you for " +
  "your understanding.";

interface Props {
  order: TrackedOrder;
  settings?: PublicSettings;
  /** Called once the advance has landed and the order is on its way. */
  onPaid: () => void;
  /** Called after the guest cancels, to send them back to the menu. */
  onCancelled: () => void;
  /** Dismisses the dialog without cancelling — the order stays held. */
  onClose: () => void;
}

/** One line of the payment summary. */
const SummaryRow = ({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <dt
      className={`text-[13px] ${
        emphasis ? "font-semibold text-ivory" : "text-ivory-dim"
      }`}
    >
      {label}
    </dt>
    <dd
      className={
        emphasis
          ? "font-display text-xl text-gold sm:text-2xl"
          : "text-sm font-medium text-ivory"
      }
    >
      {value}
    </dd>
  </div>
);

const AdvancePaymentDialog = ({
  order,
  settings,
  onPaid,
  onCancelled,
  onClose,
}: Props) => {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus lands on a control inside the dialog, so a keyboard or screen-reader
  // user is not left tabbing through the page behind it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // The page behind must not scroll while a blocking dialog is open, or a
  // thumb-scroll on a phone moves the menu instead of the dialog.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const cancelOrder = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.post<ApiResponse<{ orderNumber: string }>>(
          `/orders/track/${order.trackingToken}/cancel`
        )
      ),
    onSuccess: onCancelled,
  });

  const advance = order.advanceAmount ?? "0";
  const percent = settings?.advancePaymentPercent ?? "20";

  // Derived from the two figures already on screen, so the arithmetic the
  // guest can do in their head always agrees with what is displayed.
  const remaining = fromMinor(
    Math.max(0, toMinor(order.totalAmount) - toMinor(advance))
  );

  const awaitingPayment = order.status === "AWAITING_ADVANCE_PAYMENT";

  return (
    <>
      <div
        className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-obsidian/70 p-0 backdrop-blur-md sm:items-center sm:p-6"
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="advance-title"
          aria-describedby="advance-message"
          className="animate-rise glass relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-luxe border border-gold/25 p-6 shadow-2xl sm:rounded-luxe sm:p-8"
        >
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full p-2 text-ivory-faint transition hover:bg-smoke hover:text-ivory"
          >
            ✕
          </button>

          {/* ------------------------------------------------ branding */}
          <div className="text-center">
            {settings?.name && (
              <p className="eyebrow text-slate">{settings.name}</p>
            )}

            <div className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
              <span className="text-2xl">🍽️</span>
            </div>

            <h2
              id="advance-title"
              className="font-display mt-4 text-[clamp(1.5rem,6vw,2rem)] leading-tight text-ivory"
            >
              Advance Payment Required
            </h2>

            <div className="rule-fade mx-auto mt-4 h-px w-24" />
          </div>

          {/* ------------------------------------------------- message */}
          <p
            id="advance-message"
            className="mt-5 text-center text-[13px] leading-relaxed text-ivory-dim"
          >
            {settings?.advancePaymentMessage?.trim() || HOUSE_MESSAGE}
          </p>

          {/* ------------------------------------------------- summary */}
          <dl className="mt-6 divide-y divide-smoke rounded-luxe border border-smoke bg-charcoal/60 px-5 py-2">
            <SummaryRow
              label="Table"
              value={order.table ? order.table.tableNumber : "Takeaway"}
            />
            <SummaryRow label="Order Total" value={formatMoney(order.totalAmount)} />
            <SummaryRow
              label={`Advance Required (${percent}%)`}
              value={formatMoney(advance)}
              emphasis
            />
            <SummaryRow
              label="Remaining After Dining"
              value={formatMoney(remaining)}
            />
            <SummaryRow
              label="Payment Status"
              value={awaitingPayment ? "Awaiting advance" : "Awaiting approval"}
            />
          </dl>

          {/*
            An order still in NEEDS_APPROVAL cannot be paid yet: a waiter is on
            their way to the table, and taking money before anyone has looked
            would put the restaurant in the position of refunding a guest it
            then turns away.
          */}
          {!awaitingPayment && (
            <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center text-[12px] leading-relaxed text-amber-200">
              A member of our team is on their way to your table to confirm this
              order. Payment opens as soon as they have.
            </p>
          )}

          {cancelOrder.isError && (
            <div className="mt-4">
              <LuxeError message={getErrorMessage(cancelOrder.error)} />
            </div>
          )}

          {/* ------------------------------------------------- actions */}
          {confirmingCancel ? (
            <div className="mt-6 rounded-luxe border border-ember/40 bg-ember/10 p-4">
              <p className="text-center text-[13px] text-ivory">
                Cancel this order? Nothing has been prepared, so there is no
                charge.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  className="min-h-11 rounded-xl border border-smoke text-sm font-semibold text-ivory-dim transition hover:text-ivory"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  disabled={cancelOrder.isPending}
                  onClick={() => cancelOrder.mutate()}
                  className="min-h-11 rounded-xl bg-ember text-sm font-bold text-ivory transition hover:brightness-110 disabled:opacity-50"
                >
                  {cancelOrder.isPending ? "Cancelling…" : "Yes, cancel"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              <LuxeButton
                className="w-full py-3 font-bold"
                disabled={!awaitingPayment}
                onClick={() => setCheckoutOpen(true)}
              >
                Pay Advance {formatMoney(advance)}
              </LuxeButton>

              <button
                type="button"
                onClick={() => setConfirmingCancel(true)}
                className="min-h-11 w-full rounded-xl border border-smoke text-sm font-semibold text-ivory-dim transition hover:border-ember/50 hover:text-ivory"
              >
                Cancel Order
              </button>

              <p className="text-center text-[11px] leading-relaxed text-ivory-faint">
                {settings?.allowCashAdvance
                  ? "You can also hand the advance to your waiter in cash."
                  : "The remaining balance is settled at your table after the meal."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/*
        Rendered outside the dialog so the checkout sits above it. The guest
        keeps the same payment sheet they would see for any other bill — UPI
        apps, UPI ID, card, cash — with the amount set to the advance.
      */}
      {checkoutOpen && (
        <DemoCheckout
          trackingToken={order.trackingToken}
          amount={advance}
          depositOf={order.totalAmount}
          onClose={() => setCheckoutOpen(false)}
          onPaid={() => {
            setCheckoutOpen(false);
            onPaid();
          }}
        />
      )}
    </>
  );
};

export default AdvancePaymentDialog;
