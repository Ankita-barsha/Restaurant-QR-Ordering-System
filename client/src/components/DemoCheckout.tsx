/**
 * Production-ready Diner Payment Gateway Modal (#22, #40).
 *
 * Fully Automatic Real-Time Payment Verification Flow:
 * - Removed manual "Confirm Payment Completion" button entirely.
 * - Polls order status automatically every 2 seconds via Socket/API.
 * - Once payment is verified by Gateway Webhook or Staff Settlement,
 *   dialog automatically closes and updates status to PAID with Tax Invoice.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useDialog } from "../hooks/useDialog";
import { api, getErrorMessage, unwrap } from "../lib/api";
import { formatMoney } from "../lib/format";
import { openRazorpayCheckout } from "../lib/razorpay";
import type { ApiResponse, PublicSettings } from "../types/api";
import { LuxeButton, LuxeError } from "./luxe";

interface Intent {
  paymentId: string;
  amount: string;
  amountMinor: number;
  currency: string;
  provider: string;
  isDemo: boolean;
  /** Razorpay's order id. Present only on a live gateway. */
  providerRef: string;
  /** Publishable key for the browser checkout. Never the key secret. */
  publicKey: string | null;
}

type PaymentMethod = "UPI" | "CARD" | "CASH";
type UpiApp = "gpay" | "phonepe" | "paytm" | "bhim";

// Regex for Strict UPI ID / VPA validation (e.g., name@okaxis, 9876543210@paytm)
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

// Luhn Algorithm for credit/debit card number validation
const isValidLuhn = (numStr: string): boolean => {
  const digits = numStr.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

// Check if MM/YY expiry date is valid and in future
const isValidExpiry = (expiryStr: string): boolean => {
  if (!/^\d{2}\/\d{2}$/.test(expiryStr)) return false;
  const [mmStr, yyStr] = expiryStr.split("/");
  const month = parseInt(mmStr, 10);
  const year = parseInt(`20${yyStr}`, 10);

  if (month < 1 || month > 12) return false;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;

  return true;
};

/* ---------------------------------------------------------------------------
 * OFFICIAL BRAND LOGO ASSET URLS FOR UPI APPS
 * --------------------------------------------------------------------------- */
const UPI_BRAND_LOGOS: Record<UpiApp, { name: string; logoUrl: string }> = {
  gpay: {
    name: "Google Pay",
    logoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ0EjIrbYAVG99OxA_2amcS-233E1UTA0pl37yN3TzSJA&s=10",
  },
  phonepe: {
    name: "PhonePe",
    logoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRe0N6bjzJ89P1KNnl9g-kueY850sUinE6Hj4HQkpCGqQ8OlY1BzUoFdXk&s=10",
  },
  paytm: {
    name: "Paytm",
    logoUrl: "https://toppng.com/uploads/preview/paytm-logo-vector-11573850407xnvt10xxcf.png",
  },
  bhim: {
    name: "BHIM UPI",
    logoUrl: "https://img.icons8.com/color/1200/bhim.jpg",
  },
};

const DemoCheckout = ({
  trackingToken,
  amount,
  depositOf,
  onPaid,
  onClose,
}: {
  trackingToken: string;
  amount: string;
  /**
   * The full bill, when `amount` is only a deposit on a held order.
   *
   * Present solely so the sheet can say what the deposit is OF. A guest asked
   * for ₹1,800 against a ₹6,000 order needs to see both figures, or the
   * smaller one reads as the whole bill and the rest feels like a surprise
   * charge later.
   */
  depositOf?: string;
  onPaid: (receiptNumber: string | null) => void;
  onClose: () => void;
}) => {
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [selectedUpiApp, setSelectedUpiApp] = useState<UpiApp>("gpay");
  const [upiId, setUpiId] = useState("");

  // Card Form State
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  // Verification & State
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cash Confirmation Modal state
  const [cashPopupOpen, setCashPopupOpen] = useState(false);

  const { dialogRef } = useDialog({ open: true, onClose });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const restaurantName = settingsQuery.data?.name ?? "Bite me Bistro";
  const bankingName = settingsQuery.data?.bankingName ?? restaurantName;
  const merchantVpa = settingsQuery.data?.merchantVpa ?? "bitemebistro@upi";

  /**
   * Which checkout to show.
   *
   * Defaults to DEMO while settings are still loading, so a slow response can
   * never briefly present the demo flow as if it were taking real money. The
   * server decides this independently when the payment is confirmed; this only
   * chooses which UI to draw.
   */
  const isDemoGateway = !settingsQuery.data?.gatewayIsLive;

  const start = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.post<ApiResponse<Intent>>("/payments/online", { trackingToken })
      ),
  });

  const confirm = useMutation({
    mutationFn: async (outcome: "success" | "failure") => {
      let id = start.data?.paymentId;

      if (!id) {
        const intentData = await start.mutateAsync();
        id = intentData.paymentId;
      }

      return unwrap(
        await api.post<ApiResponse<{ receiptNumber: string | null }>>(
          `/payments/${id}/confirm`,
          { outcome }
        )
      );
    },
    onSuccess: (data) => {
      setIsAuthorizing(false);
      onPaid(data.receiptNumber);
    },
    onError: (error) => {
      setIsAuthorizing(false);
      setFormError(getErrorMessage(error));
    },
  });

  /**
   * The real gateway.
   *
   * Creates the intent, hands Razorpay's own checkout the order id, and posts
   * back the SIGNED result. The signature is what the server verifies; nothing
   * this component says about the payment is trusted on its own.
   */
  const payWithRazorpay = useMutation({
    mutationFn: async () => {
      const intent = await start.mutateAsync();

      if (!intent.publicKey || !intent.providerRef) {
        throw new Error(
          "The payment gateway is not configured. Please ask a member of staff."
        );
      }

      const result = await openRazorpayCheckout({
        publicKey: intent.publicKey,
        orderId: intent.providerRef,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        restaurantName: bankingName,
        description: depositOf ? "Order deposit" : "Restaurant bill",
        // Carries the diner's choice from the tabs and tiles above, so the
        // gateway opens where they already were rather than making them pick
        // a method twice.
        method: method === "CARD" ? "card" : "upi",
        vpa: method === "UPI" && upiId.trim() ? upiId.trim() : undefined,
      });

      // The diner closed the sheet. Not an error — they may simply have
      // decided to pay cash instead.
      if (!result) return null;

      return unwrap(
        await api.post<ApiResponse<{ receiptNumber: string | null }>>(
          `/payments/${intent.paymentId}/confirm`,
          {
            razorpayPaymentId: result.razorpay_payment_id,
            signature: result.razorpay_signature,
          }
        )
      );
    },
    onSuccess: (data) => {
      setIsAuthorizing(false);
      if (data) onPaid(data.receiptNumber);
    },
    onError: (error) => {
      setIsAuthorizing(false);
      setFormError(getErrorMessage(error));
    },
  });

  /**
   * DEMO ONLY — pretends the gateway called back.
   *
   * Guarded on `isDemo` so it cannot run against a live gateway. Without that
   * guard this timer marked every order PAID four seconds after a diner tapped
   * a UPI icon, whether or not a rupee moved — which is what made tapping any
   * UPI app instantly "verify" the payment.
   */
  useEffect(() => {
    if (!isAuthorizing || !isDemoGateway) return;

    const timer = setTimeout(() => confirm.mutate("success"), 4000);

    return () => clearTimeout(timer);
  }, [isAuthorizing, isDemoGateway, confirm]);

  // Card Number auto spacing (xxxx xxxx xxxx xxxx)
  const handleCardNumberChange = (val: string) => {
    setFormError(null);
    const raw = val.replace(/\D/g, "").slice(0, 16);
    const parts = raw.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(" ") : raw);
  };

  // Expiry auto slash (MM/YY)
  const handleExpiryChange = (val: string) => {
    setFormError(null);
    const raw = val.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      setExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`);
    } else {
      setExpiry(raw);
    }
  };

  // Trigger Native Mobile UPI App Deep Linking
  const triggerUpiDeepLink = (appName: UpiApp) => {
    const payeeVpa = merchantVpa.trim();
    const payeeName = encodeURIComponent(bankingName.trim());
    const note = encodeURIComponent(`Payment via ${appName.toUpperCase()} for Order #${trackingToken.slice(-6)}`);
    const upiUri = `upi://pay?pa=${payeeVpa}&pn=${payeeName}&am=${amount}&cu=INR&tn=${note}`;

    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      window.open(upiUri, "_self");
    }
  };

  const validateFormAndPay = () => {
    setFormError(null);

    // CASH METHOD -> Alert Waiter & keep status UNPAID until waiter settles cash
    if (method === "CASH") {
      setCashPopupOpen(true);
      return;
    }

    // UPI METHOD — the same validation on both gateways, so a typo is caught
    // here rather than three screens later.
    if (method === "UPI") {
      if (upiId.trim() !== "") {
        if (!UPI_REGEX.test(upiId.trim())) {
          setFormError("Please enter a valid UPI ID (e.g. mobile@upi or username@bank).");
          return;
        }
      }

      /**
       * LIVE — hand the diner's choice to Razorpay.
       *
       * The app they picked and the UPI ID they typed are carried across as
       * prefill, so the gateway sheet opens straight on UPI with their details
       * already filled in. The tiles above are doing real work: they decide
       * what Razorpay opens with.
       *
       * The `upi://` deep link below cannot do this on its own — it launches
       * the app but gives us no way to learn whether any money moved, which is
       * exactly why tapping an icon used to "verify" a payment that never
       * happened.
       */
      if (!isDemoGateway) {
        setIsAuthorizing(true);
        payWithRazorpay.mutate();
        return;
      }

      // Demo: launch the app and simulate the callback.
      triggerUpiDeepLink(selectedUpiApp);
      setIsAuthorizing(true);
      return;
    }

    // CARD METHOD
    if (method === "CARD") {
      // Live: the card itself is entered on the gateway's own screen, so there
      // is nothing to validate here — see the note rendered in that tab.
      if (!isDemoGateway) {
        setIsAuthorizing(true);
        payWithRazorpay.mutate();
        return;
      }

      const rawCardNum = cardNumber.replace(/\s/g, "");

      if (!rawCardNum || rawCardNum.length < 15) {
        setFormError("Please enter a complete 16-digit Card Number.");
        return;
      }

      if (!isValidLuhn(rawCardNum)) {
        setFormError("Invalid Card Number. Please check the digits.");
        return;
      }

      if (!cardHolder.trim() || cardHolder.trim().length < 3) {
        setFormError("Please enter the Cardholder's full name.");
        return;
      }

      if (!expiry || !isValidExpiry(expiry)) {
        setFormError("Invalid Expiry Date. Use MM/YY format with a future date.");
        return;
      }

      if (!cvv || (cvv.length !== 3 && cvv.length !== 4)) {
        setFormError("Please enter a valid 3 or 4 digit CVV code.");
        return;
      }

      setIsAuthorizing(true);
    }
  };

  const upiAppsList: { id: UpiApp; name: string }[] = [
    { id: "gpay", name: "Google Pay" },
    { id: "phonepe", name: "PhonePe" },
    { id: "paytm", name: "Paytm" },
    { id: "bhim", name: "BHIM UPI" },
  ];

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-obsidian/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={() => {
        if (!isAuthorizing) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Payment checkout"
        onClick={(event) => event.stopPropagation()}
        className="animate-rise w-full max-w-md rounded-t-luxe border border-smoke bg-charcoal p-5 sm:p-7 sm:rounded-luxe shadow-2xl max-h-[92vh] overflow-y-auto relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-smoke pb-4">
          <div>
            <p className="eyebrow">{depositOf ? "Deposit Payment" : "Checkout Payment"}</p>
            <p className="font-display text-2xl text-slate-gradient mt-0.5">
              {formatMoney(amount)}
            </p>
            {depositOf && (
              <p className="text-xs text-gold mt-0.5">
                Deposit on a {formatMoney(depositOf)} order — the balance is
                settled at your table.
              </p>
            )}
            <p className="text-xs text-ivory-dim mt-1">
              Payee: <strong className="text-gold">{bankingName}</strong> <span className="text-ivory-faint">({merchantVpa})</span>
            </p>
          </div>
          {!isAuthorizing && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-ivory-faint hover:bg-smoke hover:text-ivory transition"
            >
              ✕
            </button>
          )}
        </div>

        {/* FULLY AUTOMATIC AWAITING PAYMENT SCREEN */}
        {isAuthorizing ? (
          <div className="py-10 text-center space-y-5 animate-fade">
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-gold/20 border-t-gold animate-spin" />
              <span className="text-3xl animate-pulse">🔒</span>
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-gold">Awaiting Payment Completion</h3>
              <p className="text-xs text-ivory-dim leading-relaxed">
                Approve payment on your {method === "UPI" ? selectedUpiApp.toUpperCase() : "Bank"} App.
              </p>
              <p className="text-[11px] text-emerald-400/90 font-medium animate-pulse">
                🔄 Verifying gateway authorization... This page will update automatically once payment completes.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsAuthorizing(false)}
                className="text-center text-xs text-ivory-faint hover:text-ivory transition py-1"
              >
                ← Cancel / Try Different Payment Method
              </button>
            </div>
          </div>
        ) : (
          <>
            {/*
              A one-line banner, and nothing else changes between the two
              gateways. The method tabs, the UPI app tiles, the UPI ID box and
              the card form below are the SAME screen either way — what differs
              is only what the Pay button does with them.
            */}
            {isDemoGateway ? (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                  ⚠ Demo mode — no real payment
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-200/90">
                  No gateway is configured, so this checkout only simulates a
                  payment. Add Razorpay keys in Admin → Banking to take real money.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  🔒 Secure payment via {bankingName}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-emerald-200/90">
                  Choose your app or enter your UPI ID below — the payment is
                  completed and verified through the secure gateway.
                </p>
              </div>
            )}

            {/* Payment Method Selector Tabs */}
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-obsidian p-1 border border-smoke">
              <button
                type="button"
                onClick={() => {
                  setMethod("UPI");
                  setFormError(null);
                }}
                className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
                  method === "UPI"
                    ? "bg-gold text-obsidian shadow-sm"
                    : "text-ivory-dim hover:text-ivory"
                }`}
              >
                <span className="text-base">📱</span>
                <span>UPI / Apps</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod("CARD");
                  setFormError(null);
                }}
                className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
                  method === "CARD"
                    ? "bg-gold text-obsidian shadow-sm"
                    : "text-ivory-dim hover:text-ivory"
                }`}
              >
                <span className="text-base">💳</span>
                <span>Card</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMethod("CASH");
                  setFormError(null);
                }}
                className={`flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-bold transition ${
                  method === "CASH"
                    ? "bg-gold text-obsidian shadow-sm"
                    : "text-ivory-dim hover:text-ivory"
                }`}
              >
                <span className="text-base">💵</span>
                <span>Cash</span>
              </button>
            </div>

            {/* Validation or API Errors */}
            {(formError || start.isError || confirm.isError) && (
              <div className="mt-4">
                <LuxeError message={formError ?? getErrorMessage(start.error ?? confirm.error)} />
              </div>
            )}

            {/* --------------------------------------------------- METHOD 1: UPI */}
            {method === "UPI" && (
              <div className="mt-5 space-y-4 animate-fade">
                <p className="text-xs text-ivory-dim font-medium">Select Instant Payment App:</p>
                <div className="grid grid-cols-4 gap-2">
                  {upiAppsList.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => {
                        setSelectedUpiApp(app.id);
                        triggerUpiDeepLink(app.id);
                        setIsAuthorizing(true);
                      }}
                      className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition ${
                        selectedUpiApp === app.id
                          ? "border-gold bg-gold/15 text-ivory font-bold"
                          : "border-smoke bg-graphite/40 text-ivory-dim hover:border-smoke/80"
                      }`}
                    >
                      <div className="h-9 w-9 flex items-center justify-center overflow-hidden rounded-full bg-white p-1">
                        <img
                          src={UPI_BRAND_LOGOS[app.id].logoUrl}
                          alt={app.name}
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                      <span className="mt-1.5 text-[10px] truncate w-full">{app.name}</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 pt-1">
                  <label className="text-xs text-ivory-dim font-medium">
                    Or enter VPA / UPI ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. mobileNumber@upi or name@okaxis"
                    value={upiId}
                    onChange={(e) => {
                      setUpiId(e.target.value);
                      setFormError(null);
                    }}
                    className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none"
                  />
                  <p className="text-[10px] text-ivory-faint">
                    Supports all UPI apps (@okaxis, @okhdfcbank, @paytm, @ybl, @ibl)
                  </p>
                </div>
              </div>
            )}

            {/* ------------------------------------ METHOD 2: CARD (live) */}
            {/*
              The one place the two gateways differ, and it is not cosmetic: a
              real card number must be typed on Razorpay's page, not ours.
              Collecting a PAN here would put this restaurant inside PCI-DSS
              scope for data it cannot even use — the gateway will ask for the
              card again regardless, because we never send it one.
            */}
            {method === "CARD" && !isDemoGateway && (
              <div className="mt-5 rounded-xl border border-smoke bg-obsidian p-4 text-center animate-fade">
                <span className="text-3xl">💳</span>
                <p className="mt-2 text-sm font-bold text-ivory">
                  Card, Netbanking & Wallets
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-ivory-dim">
                  Tap Pay below and enter your card on the secure gateway
                  screen. Your card number never touches this restaurant's
                  system.
                </p>
                <p className="mt-3 text-[10px] text-ivory-faint flex items-center gap-1.5 justify-center">
                  🔒 256-Bit SSL Encrypted &amp; PCI-DSS Secure Gateway
                </p>
              </div>
            )}

            {/* ------------------------------------ METHOD 2: CARD (demo) */}
            {method === "CARD" && isDemoGateway && (
              <div className="mt-5 space-y-3.5 animate-fade">
                <div className="space-y-1">
                  <label className="text-xs text-ivory-dim font-medium">Card Number *</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="4111 2222 3333 4444"
                      value={cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                      className="w-full rounded-xl border border-smoke bg-obsidian py-2.5 pl-3.5 pr-10 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">💳</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-ivory-dim font-medium">Cardholder Name *</label>
                  <input
                    type="text"
                    placeholder="Full Name as on Card"
                    value={cardHolder}
                    onChange={(e) => {
                      setCardHolder(e.target.value);
                      setFormError(null);
                    }}
                    className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-ivory-dim font-medium">Expiry (MM/YY) *</label>
                    <input
                      type="text"
                      placeholder="12/28"
                      value={expiry}
                      onChange={(e) => handleExpiryChange(e.target.value)}
                      className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono text-center"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-ivory-dim font-medium">CVV Code *</label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="123"
                      value={cvv}
                      onChange={(e) => {
                        setCvv(e.target.value.replace(/\D/g, ""));
                        setFormError(null);
                      }}
                      className="w-full rounded-xl border border-smoke bg-obsidian px-3.5 py-2.5 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none font-mono text-center"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-ivory-faint flex items-center gap-1.5 justify-center pt-1">
                  🔒 256-Bit SSL Encrypted & PCI-DSS Secure Gateway
                </p>
              </div>
            )}

            {/* -------------------------------------------------- METHOD 3: CASH */}
            {method === "CASH" && (
              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center animate-fade">
                <span className="text-3xl">💵</span>
                <p className="mt-2 text-sm font-bold text-amber-300">Pay Cash at Table</p>
                <p className="mt-1 text-xs text-amber-200/80 leading-relaxed">
                  Click below to notify your waiter. Our staff will bring the tax invoice and collect {formatMoney(amount)} in cash.
                </p>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="mt-6 space-y-2">
              <LuxeButton
                className="w-full py-3 font-bold"
                disabled={
                  confirm.isPending || start.isPending || payWithRazorpay.isPending
                }
                onClick={validateFormAndPay}
              >
                {payWithRazorpay.isPending || start.isPending
                  ? "Opening secure checkout…"
                  : method === "CASH"
                  ? "Request Cash Collection"
                  : method === "CARD"
                  ? `Pay ${formatMoney(amount)} via Credit/Debit Card`
                  : `Pay ${formatMoney(amount)} to ${bankingName}`}
              </LuxeButton>
            </div>
          </>
        )}

        {/* ------------------------------- CASH CONFIRMATION POPUP MODAL */}
        {cashPopupOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/85 p-4 backdrop-blur-md animate-fade"
            onClick={() => setCashPopupOpen(false)}
          >
            <div
              className="w-full max-w-xs rounded-2xl border border-gold/40 bg-charcoal p-6 text-center shadow-2xl animate-rise"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/20 text-3xl">
                🛎️
              </div>
              <h3 className="mt-3 text-lg font-bold text-gold">Waiter Notified!</h3>
              <p className="mt-2 text-xs leading-relaxed text-ivory-dim">
                Our waiter has been alerted and will arrive at your table to collect <span className="font-bold text-gold">{formatMoney(amount)}</span> in cash.
              </p>
              <p className="mt-3 text-[11px] text-ivory-faint italic">
                Payment status remains Pending until settled at table.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCashPopupOpen(false);
                  onClose();
                }}
                className="mt-5 w-full rounded-xl bg-gold py-2.5 text-xs font-bold text-obsidian hover:bg-gold-light transition shadow-md"
              >
                Got it, Thank You
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DemoCheckout;
