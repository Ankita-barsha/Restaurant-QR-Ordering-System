/**
 * Demo online checkout.
 *
 * A working online-payment experience with NO real gateway: it charges
 * nothing, collects no card details, and says so plainly. It exists so the
 * flow can be demonstrated end to end without a merchant account.
 *
 * Uses shared useDialog hook (#19) for accessibility, focus trapping, focus restoration & Escape dismiss.
 */

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useDialog } from "../hooks/useDialog";
import { api, getErrorMessage, unwrap } from "../lib/api";
import { formatMoney } from "../lib/format";
import type { ApiResponse } from "../types/api";
import { LuxeButton, LuxeError } from "./luxe";

interface Intent {
  paymentId: string;
  amount: string;
  provider: string;
  isDemo: boolean;
}

const DemoCheckout = ({
  trackingToken,
  amount,
  onPaid,
  onClose,
}: {
  /**
   * The order's tracking token. This both identifies the order and authorises
   * paying it — the API accepts nothing else, deliberately, because an order
   * number would let anyone open a payment against anyone's order.
   */
  trackingToken: string;
  amount: string;
  onPaid: (receiptNumber: string | null) => void;
  onClose: () => void;
}) => {
  const [intent, setIntent] = useState<Intent | null>(null);
  const { dialogRef } = useDialog({ open: true, onClose });

  const start = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.post<ApiResponse<Intent>>("/payments/online", { trackingToken })
      ),
    onSuccess: setIntent,
  });

  const confirm = useMutation({
    mutationFn: async (outcome: "success" | "failure") => {
      const id = intent?.paymentId;
      if (!id) throw new Error("No payment in progress");

      return unwrap(
        await api.post<ApiResponse<{ receiptNumber: string | null }>>(
          `/payments/${id}/confirm`,
          { outcome }
        )
      );
    },
    onSuccess: (data) => onPaid(data.receiptNumber),
  });

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-obsidian/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Online payment"
        onClick={(event) => event.stopPropagation()}
        className="animate-rise w-full max-w-sm rounded-t-luxe border border-smoke bg-charcoal p-7 sm:rounded-luxe"
      >
        <div className="text-center">
          <p className="eyebrow">Pay online</p>
          <p className="font-display mt-3 text-5xl text-gold-gradient">
            {formatMoney(amount)}
          </p>
        </div>

        {/* Honesty banner — this is never presented as a real charge. */}
        <div className="mt-6 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3 text-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold">
            Demo payment
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ivory-faint">
            No real money is charged and no card details are taken. This
            simulates the online-payment step for the demo.
          </p>
        </div>

        {(start.isError || confirm.isError) && (
          <div className="mt-5">
            <LuxeError message={getErrorMessage(start.error ?? confirm.error)} />
          </div>
        )}

        {!intent ? (
          <LuxeButton
            className="mt-6 w-full"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "Opening checkout…" : "Continue"}
          </LuxeButton>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <LuxeButton
              className="w-full"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate("success")}
            >
              {confirm.isPending ? "Processing…" : "Pay now (demo)"}
            </LuxeButton>

            <button
              type="button"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate("failure")}
              className="text-[11px] uppercase tracking-[0.18em] text-ivory-faint transition-colors hover:text-ember disabled:opacity-40"
            >
              Simulate a failed payment
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full text-center text-[10px] uppercase tracking-[0.2em] text-ivory-faint hover:text-ivory"
        >
          Pay at the table instead
        </button>
      </div>
    </div>
  );
};

export default DemoCheckout;
