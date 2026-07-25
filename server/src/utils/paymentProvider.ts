/**
 * Payment provider.
 *
 * Every payment flows through the PaymentProvider interface, never through a
 * specific gateway's SDK directly. Swapping the built-in demo gateway for
 * real Razorpay or Stripe later means writing one new implementation and
 * changing the export at the bottom — no service or controller changes.
 *
 * The DEMO provider below charges nothing and stores no card details. It
 * exists so the full online-payment experience can be demonstrated without a
 * merchant account. It is clearly surfaced to the customer as a demo, and it
 * must never be presented as a real charge.
 *
 * To go live:
 *   1. npm install razorpay
 *   2. add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to the env schema
 *   3. implement PaymentProvider with the Razorpay SDK (createIntent →
 *      razorpay.orders.create; verifyConfirmation → verify the webhook
 *      signature) and export it instead of the demo one.
 */

import crypto from "node:crypto";

/** What the client needs to open a checkout for an order. */
export interface PaymentIntent {
  /** The provider's own reference for this attempt. */
  providerRef: string;
  /** Amount in the smallest currency unit (paise), as gateways expect. */
  amountMinor: number;
  currency: string;
  /** Names the provider so the client renders the right checkout. */
  provider: string;
  /** True for the built-in demo gateway, so the UI can label it honestly. */
  isDemo: boolean;
}

/** The payload a provider hands back to confirm an attempt. */
export interface ConfirmationPayload {
  providerRef: string;
  /** Demo only: the simulated outcome chosen by the payer. */
  outcome?: "success" | "failure";
  /** Real gateways: the signature to verify. Unused by the demo provider. */
  signature?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isDemo: boolean;

  /** Creates a payment intent for an amount given in paise. */
  createIntent(amountMinor: number, currency: string): Promise<PaymentIntent>;

  /**
   * Confirms an attempt. A real provider verifies a cryptographic signature
   * here; the demo provider trusts the outcome the payer selected.
   */
  verifyConfirmation(payload: ConfirmationPayload): Promise<boolean>;
}

/**
 * Built-in demo gateway.
 *
 * createIntent mints a fake reference; verifyConfirmation succeeds only when
 * the payer chose "success". No money moves and no card data is touched.
 */
class DemoPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly isDemo = true;

  async createIntent(amountMinor: number, currency: string): Promise<PaymentIntent> {
    return {
      providerRef: `demo_${crypto.randomBytes(9).toString("hex")}`,
      amountMinor,
      currency,
      provider: this.name,
      isDemo: true,
    };
  }

  async verifyConfirmation(payload: ConfirmationPayload): Promise<boolean> {
    // A real provider would recompute and compare a signature. The demo simply
    // honours the outcome the payer picked on the demo checkout screen.
    return payload.outcome === "success";
  }
}

/**
 * The active provider. Replace this single line with a Razorpay/Stripe
 * implementation once keys are configured; nothing else changes.
 */
export const paymentProvider: PaymentProvider = new DemoPaymentProvider();
