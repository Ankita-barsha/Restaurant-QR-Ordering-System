/**
 * Razorpay Checkout.
 *
 * The gateway's own hosted checkout, opened as an overlay. We do NOT collect
 * card numbers or UPI credentials ourselves when this is active — Razorpay
 * does, on their page, and hands back a signed result. That is not only far
 * less code, it is the difference between the restaurant being in scope for
 * PCI compliance and not being in scope at all.
 *
 * It is also what makes real UPI work: Razorpay's sheet lists the UPI apps
 * installed on the phone, accepts a typed UPI ID for a collect request, and
 * shows a QR on desktop. Reimplementing that with `upi://` deep links — as the
 * demo checkout does — cannot verify that any money actually moved.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** What Razorpay hands back when a payment succeeds. */
export interface RazorpayResult {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: {
    name?: string;
    contact?: string;
    email?: string;
    /** Opens the sheet on this tab: "upi", "card", "netbanking", "wallet". */
    method?: string;
    /** Fills the UPI ID box for a collect request. */
    vpa?: string;
  };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpayResult) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;

/**
 * Loads the checkout script once.
 *
 * The promise is cached rather than the boolean: two components opening a
 * checkout at the same moment would otherwise both inject a tag, and the
 * second would resolve before its script had finished parsing.
 */
export const loadRazorpay = (): Promise<void> => {
  if (window.Razorpay) return Promise.resolve();

  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");

    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Cleared so a later attempt retries instead of returning this same
      // rejected promise for the rest of the session — a diner who lost Wi-Fi
      // for a moment must be able to try again.
      loader = null;
      reject(new Error("Could not reach the payment gateway. Check your connection."));
    };

    document.body.appendChild(script);
  });

  return loader;
};

export interface OpenCheckoutInput {
  /** Publishable key id from the payment intent. Never the key secret. */
  publicKey: string;
  /** Razorpay's own order id, created server-side. */
  orderId: string;
  /** Amount in paise, as the gateway expects. */
  amountMinor: number;
  currency: string;
  restaurantName: string;
  description: string;
  prefill?: { name?: string; contact?: string };
  /**
   * Which tab the gateway sheet opens on.
   *
   * Carries the diner's choice across from our own method tabs, so picking
   * "UPI / Apps" here does not mean picking it again there.
   */
  method?: "upi" | "card" | "netbanking" | "wallet";
  /** A UPI ID the diner already typed, prefilled into the collect box. */
  vpa?: string;
}

/**
 * Opens the checkout and resolves with Razorpay's signed result.
 *
 * Resolves `null` when the diner closes the sheet without paying — a normal
 * thing to do, and not an error to show them.
 */
export const openRazorpayCheckout = async (
  input: OpenCheckoutInput
): Promise<RazorpayResult | null> => {
  await loadRazorpay();

  const Checkout = window.Razorpay;

  if (!Checkout) {
    throw new Error("The payment gateway did not load. Please try again.");
  }

  return new Promise<RazorpayResult | null>((resolve, reject) => {
    let settled = false;

    const checkout = new Checkout({
      key: input.publicKey,
      amount: input.amountMinor,
      currency: input.currency,
      name: input.restaurantName,
      description: input.description,
      order_id: input.orderId,
      prefill: {
        ...input.prefill,
        ...(input.method ? { method: input.method } : {}),
        ...(input.vpa ? { vpa: input.vpa } : {}),
      },
      theme: { color: "#c9a961" },
      handler: (response) => {
        settled = true;
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          // Guarded: Razorpay fires ondismiss after a successful payment too,
          // as the sheet closes itself. Without this the resolve above would
          // be followed by a second resolve(null) — harmless for a promise,
          // but it hides the fact that the flow completed.
          if (!settled) resolve(null);
        },
      },
    });

    checkout.on("payment.failed", (payload: unknown) => {
      settled = true;

      const description =
        (payload as { error?: { description?: string } })?.error?.description ??
        "The payment did not go through.";

      reject(new Error(description));
    });

    checkout.open();
  });
};
