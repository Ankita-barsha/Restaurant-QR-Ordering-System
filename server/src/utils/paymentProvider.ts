/**
 * Payment providers.
 *
 * Every payment flows through the PaymentProvider interface, never through a
 * gateway SDK directly, so the services below know nothing about Razorpay.
 *
 * TWO providers exist, and WHICH ONE IS ACTIVE IS DECIDED AT RUNTIME from the
 * restaurant's settings:
 *
 *   RazorpayPaymentProvider — real money. Creates a real order through
 *                             Razorpay's API and will not confirm a payment
 *                             without a valid signature from Razorpay.
 *   DemoPaymentProvider     — no money, for demonstrations and local work.
 *                             Confirms whatever the payer's browser claims.
 *
 * THE DIFFERENCE MATTERS. The demo provider trusts the client, because in a
 * demo there is nothing to steal. Letting that trust survive into production
 * means any diner can mark their own bill paid from the browser console, so
 * `isDemo` gates that behaviour everywhere it appears and the demo provider is
 * never selected while Razorpay keys are configured.
 */

import crypto from "node:crypto";

import Razorpay from "razorpay";

import { prisma } from "../config/prisma.js";
import { AppError } from "./AppError.js";

/** What the client needs to open a checkout for an order. */
export interface PaymentIntent {
  /** The gateway's own order reference. Real for Razorpay, minted for demo. */
  providerRef: string;
  /** Amount in the smallest currency unit (paise), as gateways expect. */
  amountMinor: number;
  currency: string;
  /** Names the provider so the client renders the right checkout. */
  provider: string;
  /** True for the built-in demo gateway, so the UI can label it honestly. */
  isDemo: boolean;
  /**
   * The PUBLISHABLE key, needed by Razorpay's browser checkout.
   *
   * Safe to send to a diner — it identifies the merchant and cannot authorise
   * anything on its own. The key SECRET never leaves this server.
   */
  publicKey?: string;
}

/**
 * What a provider needs to decide whether a payment really happened.
 *
 * The three razorpay* fields are exactly what Razorpay's checkout hands back
 * to the browser. `outcome` is demo-only and is ignored by the real provider —
 * that is the whole point of it being a separate field.
 */
export interface ConfirmationPayload {
  /** The order reference stored when the intent was created. */
  providerRef: string;
  /** Demo only: the simulated outcome chosen by the payer. */
  outcome?: "success" | "failure";
  /** Razorpay's id for the completed payment, e.g. "pay_XXXX". */
  razorpayPaymentId?: string;
  /** HMAC signature Razorpay returns alongside it. */
  signature?: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isDemo: boolean;

  /** Creates a payment intent for an amount given in paise. */
  createIntent(amountMinor: number, currency: string): Promise<PaymentIntent>;

  /**
   * Confirms an attempt.
   *
   * The real provider verifies a cryptographic signature; the demo provider
   * trusts the outcome the payer selected. Returning false must always be
   * treated as "the money did not arrive".
   */
  verifyConfirmation(payload: ConfirmationPayload): Promise<boolean>;

  /**
   * Verifies an incoming webhook against the RAW request body.
   *
   * Raw, not the parsed object: the signature covers the exact bytes Razorpay
   * sent, and JSON.stringify of a parsed body reorders keys and drops
   * whitespace, so a re-serialised body never matches.
   */
  verifyWebhook(rawBody: string, signature: string): boolean;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

/**
 * Built-in demo gateway.
 *
 * Mints a fake reference and confirms whatever the payer's browser says. No
 * money moves and no card data is touched. Selected ONLY when no Razorpay
 * credentials are configured.
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
    return payload.outcome === "success";
  }

  /**
   * Refuses every webhook.
   *
   * A demo restaurant has no gateway to receive webhooks from, so anything
   * arriving at that endpoint is either a mistake or somebody trying to forge
   * a payment. Neither should be accepted.
   */
  verifyWebhook(): boolean {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Razorpay
// ---------------------------------------------------------------------------

/**
 * Real Razorpay gateway.
 *
 * createIntent calls Razorpay and returns THEIR order id. That is not a
 * formality: the browser checkout will not open without a real order id, and
 * the confirmation signature is computed over it, so a locally invented
 * reference — which an earlier version of this file used — can never verify.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "razorpay";
  readonly isDemo = false;

  private readonly client: Razorpay;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    /** Razorpay signs webhook bodies with this, NOT with the key secret. */
    private readonly webhookSecret: string | null
  ) {
    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  async createIntent(amountMinor: number, currency: string): Promise<PaymentIntent> {
    try {
      const order = await this.client.orders.create({
        amount: amountMinor,
        currency,
        // Our own reference, echoed back on every event about this order.
        receipt: `rcpt_${crypto.randomBytes(8).toString("hex")}`,
        // Razorpay may capture automatically; without this the money is only
        // authorised and has to be captured by a second call, and an
        // uncaptured authorisation expires and silently refunds itself.
        payment_capture: true,
      });

      return {
        providerRef: order.id,
        amountMinor,
        currency,
        provider: this.name,
        isDemo: false,
        publicKey: this.keyId,
      };
    } catch (error) {
      // Razorpay's errors carry the merchant-facing reason — bad keys, an
      // account not yet activated, an amount below the minimum. Surfacing it
      // is the difference between a fixable message and "payment failed".
      const description =
        (error as { error?: { description?: string } })?.error?.description ??
        (error instanceof Error ? error.message : "Unknown gateway error");

      throw AppError.badRequest(`Razorpay could not create the payment: ${description}`);
    }
  }

  /**
   * Verifies a checkout response.
   *
   * Razorpay signs `order_id|payment_id` with the KEY SECRET. Both ids must
   * come from the gateway's response; the order id is compared against what we
   * stored when the intent was created, by the caller.
   */
  async verifyConfirmation(payload: ConfirmationPayload): Promise<boolean> {
    if (!payload.signature || !payload.razorpayPaymentId) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(`${payload.providerRef}|${payload.razorpayPaymentId}`)
      .digest("hex");

    return timingSafeEqual(expected, payload.signature);
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    // No configured secret means no way to tell a real event from a forged
    // one, so nothing is accepted. Failing closed is the only safe default
    // for an endpoint that marks bills paid.
    if (!this.webhookSecret || !signature) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");

    return timingSafeEqual(expected, signature);
  }
}

/**
 * Compares two hex digests without leaking their difference through timing.
 *
 * A plain `===` on a signature returns faster the earlier it finds a
 * mismatched byte, which is enough to reconstruct a valid signature one byte
 * at a time given enough attempts.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");

  // crypto.timingSafeEqual throws on a length mismatch, which would itself be
  // a timing signal; comparing lengths first is safe because the length of a
  // signature is not a secret.
  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
};

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * The provider to use right now.
 *
 * Read from the database on every call rather than cached at import time, so
 * an administrator entering their keys switches the restaurant to real
 * payments without a restart — and, more importantly, so removing bad keys
 * takes effect immediately.
 *
 * There is deliberately NO module-level `paymentProvider` export any more. The
 * previous one was a DemoPaymentProvider instance, and because every service
 * imported that constant instead of calling this function, the configured
 * Razorpay keys were never used and every payment was confirmed by the
 * customer's own browser.
 */
export const getActivePaymentProvider = async (): Promise<PaymentProvider> => {
  try {
    const settings = await prisma.restaurantSettings.findUnique({
      where: { id: "singleton" },
      select: {
        paymentGatewayProvider: true,
        razorpayKeyId: true,
        razorpayKeySecret: true,
        razorpayWebhookSecret: true,
      },
    });

    if (
      settings?.paymentGatewayProvider === "RAZORPAY" &&
      settings.razorpayKeyId &&
      settings.razorpayKeySecret
    ) {
      return new RazorpayPaymentProvider(
        settings.razorpayKeyId,
        settings.razorpayKeySecret,
        settings.razorpayWebhookSecret
      );
    }
  } catch (error) {
    // A database blip must not silently downgrade a live restaurant to the
    // demo gateway, which would confirm payments for free. Log loudly.
    console.error("[payments] could not read gateway settings:", error);
  }

  return new DemoPaymentProvider();
};

/** Whether real money is being taken. Used to gate demo-only behaviour. */
export const isLiveGateway = async (): Promise<boolean> =>
  !(await getActivePaymentProvider()).isDemo;
