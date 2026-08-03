/**
 * Order review and checkout.
 *
 * The request sends only foodId, quantity and notes. It deliberately carries
 * NO prices — the server recalculates every line from the database, so the
 * totals shown here are indicative and cannot be tampered with.
 *
 * Name and phone are REQUIRED. They are checked here so the diner is told
 * which field is wrong before the round trip, and again on the server, which
 * is where the rule actually lives — this screen is convenience, not the gate.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import CustomerFooter from "../../components/CustomerFooter";
import { LuxeButton, LuxeEmpty, LuxeError } from "../../components/luxe";
import { config } from "../../config/env";
import { saveOrderToken, useCart } from "../../context/cart";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import { calculateAdvanceDetails, fromMinor, quoteTotals, toMinor } from "../../lib/money";
import type { ApiResponse, Order, PublicSettings } from "../../types/api";

const fieldClass =
  "w-full rounded-xl border border-smoke bg-charcoal px-4 py-3 text-base text-ivory placeholder:text-ivory-faint transition-colors focus:border-gold/50 focus:outline-none sm:text-sm";

/** Applied on top of fieldClass once a required field has failed. */
const fieldErrorClass = "border-ember focus:border-ember";

/**
 * Strips the punctuation people type into a phone box.
 *
 * "+91 98765-43210" and "9876543210" are the same person. The server
 * normalises identically before matching a returning diner on their number,
 * so doing it here keeps the message this screen shows honest.
 */
const normalisePhone = (value: string): string => value.replace(/[\s()\-.]/g, "");

/**
 * Validates the contact details.
 *
 * Returns a message per bad field rather than a boolean, so the diner is told
 * WHICH box is wrong. "Please check your details" makes them re-read both.
 */
const contactProblems = (
  name: string,
  phone: string
): { name?: string; phone?: string } => {
  const problems: { name?: string; phone?: string } = {};

  if (name.trim().length < 2) {
    problems.name = "Please tell us your name";
  }

  if (!/^\+?\d{10,15}$/.test(normalisePhone(phone))) {
    problems.phone = "Enter a valid phone number (at least 10 digits)";
  }

  return problems;
};

const CustomerCart = () => {
  const navigate = useNavigate();
  const {
    table,
    qrToken,
    items,
    itemCount,
    subtotalMinor,
    increase,
    decrease,
    removeItem,
    setNotes,
    clearCart,
  } = useCart();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [includeServiceCharge, setIncludeServiceCharge] = useState(true);

  /**
   * Errors are held back until the diner tries to order.
   *
   * Marking a field red the moment the screen opens scolds someone who has not
   * typed anything yet. From the first failed attempt onwards they update
   * live, which is what makes the message useful while it is being fixed.
   */
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const problems = contactProblems(name, phone);
  const showProblems = attempted ? problems : {};

  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const payload = {
        qrToken: qrToken ?? undefined,
        // Always sent, never conditional: both fields are mandatory, and the
        // server rejects the order outright without them.
        customer: { name: name.trim(), phone: normalisePhone(phone) },
        notes: orderNotes || undefined,
        items: items.map((item) => ({
          foodId: item.foodId,
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
      };

      return unwrap(await api.post<ApiResponse<Order>>("/orders", payload));
    },
    onSuccess: (order) => {
      clearCart();
      saveOrderToken(order.trackingToken);
      navigate(`/track/${order.trackingToken}`);
    },
  });

  /**
   * Guards the send on the required details.
   *
   * The button stays ENABLED when the form is incomplete, and refuses on tap
   * instead. A greyed-out "Place order" tells a diner nothing about why the
   * app has stopped working; this one scrolls the offending box into view,
   * focuses it and says what is missing.
   */
  const submit = () => {
    const found = contactProblems(name, phone);

    if (found.name || found.phone) {
      setAttempted(true);

      const field = found.name ? nameRef.current : phoneRef.current;
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
      field?.focus({ preventScroll: true });

      return;
    }

    placeOrder.mutate();
  };

  if (itemCount === 0) {
    return (
      <div className="min-h-screen bg-obsidian pt-28">
        <LuxeEmpty
          title="Your order is empty"
          hint="Choose a few plates from the menu and they will appear here."
          action={
            <Link to="/menu" className="mt-2">
              <LuxeButton>Browse the menu</LuxeButton>
            </Link>
          }
        />
      </div>
    );
  }

  /**
   * The quote.
   *
   * Both charges, computed in integer paise by the same rules the server uses,
   * so what the diner is shown here is what they are asked to pay. Applying
   * tax alone — as this screen once did — under-quoted every basket wherever a
   * service charge was configured.
   *
   * Still an estimate: prices, availability and the charges themselves are
   * re-read server-side when the order is placed. It is an honest one now.
   */
  const taxPercent = settingsQuery.data?.taxPercent ?? "0";
  const rawServicePercent = settingsQuery.data?.serviceChargePercent ?? "0";
  const servicePercent = includeServiceCharge ? rawServicePercent : "0";
  const quote = quoteTotals(subtotalMinor, taxPercent, servicePercent);

  const currency = settingsQuery.data?.currency;
  const money = (value: string) => formatMoney(value, currency);

  /**
   * What the offers on this basket took off, in exact paise.
   *
   * Derived from the two prices each line already carries, so it cannot
   * disagree with the subtotal above it.
   */
  const savedMinor = items.reduce(
    (sum, item) =>
      item.listPrice
        ? sum + (toMinor(item.listPrice) - toMinor(item.price)) * item.quantity
        : sum,
    0
  );

  const hasTax = toMinor(taxPercent) > 0;

  return (
    <div className="min-h-screen bg-obsidian pb-44 pt-24 sm:pt-28">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <header className="text-center">
          <p className="eyebrow">
            {table ? `Table ${table.tableNumber}` : "Takeaway"}
          </p>
          <h1 className="mt-3 text-[clamp(2.25rem,6vw,3.5rem)] leading-tight text-ivory">
            Your Order
          </h1>
          <div className="rule-fade mx-auto mt-5 h-px w-28" />
        </header>

        {/* Tablet two-column: items list left, summary+details right */}
        <div className="mt-12 md:grid md:grid-cols-[1fr_360px] md:items-start md:gap-10 lg:grid-cols-[1fr_400px]">

          {/* ---------------------------------------------- line items (left col) */}
          <div className="divide-y divide-smoke border-y border-smoke">
          {items.map((item) => {
            const image = imageUrl(item.imageUrl, config.apiUrl);

            return (
              <div key={item.foodId} className="flex gap-3.5 py-5 sm:gap-5 sm:py-6">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-graphite text-2xl sm:h-20 sm:w-20">
                    🍽️
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <h2 className="text-lg leading-tight text-ivory sm:text-xl">{item.name}</h2>
                    <span className="font-display shrink-0 text-lg text-slate sm:text-xl">
                      {money(fromMinor(toMinor(item.price) * item.quantity))}
                    </span>
                  </div>

                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-ivory-faint">
                    <span>{money(item.price)} each</span>
                    {item.listPrice && (
                      <span className="line-through opacity-70">
                        {money(item.listPrice)}
                      </span>
                    )}
                  </p>

                  <div className="mt-3.5 flex flex-wrap items-center gap-3 sm:gap-5">
                    <div className="flex items-center rounded-full border border-smoke">
                      <button
                        type="button"
                        onClick={() => decrease(item.foodId)}
                        aria-label={`One fewer ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-ivory-dim transition-colors hover:text-slate"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm text-ivory">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => increase(item.foodId)}
                        aria-label={`One more ${item.name}`}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-ivory-dim transition-colors hover:text-slate"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.foodId)}
                      className="min-h-11 px-1 text-[10px] uppercase tracking-[0.2em] text-ivory-faint transition-colors hover:text-ember"
                    >
                      Remove
                    </button>
                  </div>

                  <input
                    type="text"
                    value={item.notes ?? ""}
                    onChange={(event) => setNotes(item.foodId, event.target.value)}
                    placeholder="A note for the kitchen"
                    className="mt-3.5 w-full rounded-lg border border-smoke bg-charcoal px-3 py-2.5 text-base text-ivory placeholder:text-ivory-faint focus:border-gold/40 focus:outline-none sm:text-xs"
                  />
                </div>
              </div>
            );
          })}
          </div>

          {/* --------------------------------- details + totals (right col on tablet) */}
          <div className="md:sticky md:top-28">
            {/* --------------------------------------------------------- details */}
            <section className="mt-12 md:mt-0">
              <h2 className="text-2xl text-ivory">Your details</h2>
              <p className="mt-1.5 text-[13px] text-ivory-faint">
                Required — so the waiter knows whose order this is, and can
                reach you if anything about it needs checking.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-1">
                <div>
                  <input
                    ref={nameRef}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Name *"
                    aria-label="Your name"
                    autoComplete="name"
                    required
                    aria-invalid={Boolean(showProblems.name)}
                    aria-describedby={showProblems.name ? "cart-name-error" : undefined}
                    className={`${fieldClass} ${showProblems.name ? fieldErrorClass : ""}`}
                  />
                  {showProblems.name && (
                    <p id="cart-name-error" className="mt-1.5 text-[12px] text-ember">
                      {showProblems.name}
                    </p>
                  )}
                </div>

                <div>
                  <input
                    ref={phoneRef}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="Phone *"
                    inputMode="tel"
                    aria-label="Your phone number"
                    autoComplete="tel"
                    required
                    aria-invalid={Boolean(showProblems.phone)}
                    aria-describedby={showProblems.phone ? "cart-phone-error" : undefined}
                    className={`${fieldClass} ${showProblems.phone ? fieldErrorClass : ""}`}
                  />
                  {showProblems.phone && (
                    <p id="cart-phone-error" className="mt-1.5 text-[12px] text-ember">
                      {showProblems.phone}
                    </p>
                  )}
                </div>
              </div>

              <textarea
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
                placeholder="Anything the kitchen should know — allergies, preferences"
                rows={2}
                aria-label="Notes for the kitchen"
                className={`${fieldClass} mt-4`}
              />
            </section>

            {/* ---------------------------------------------------------- totals */}
            <section className="glass rounded-luxe mt-8 p-5 sm:p-7">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between text-ivory-dim">
                  <dt>Subtotal</dt>
                  <dd>{money(quote.subtotal)}</dd>
                </div>

                {hasTax && (
                  <div className="flex justify-between text-ivory-dim">
                    <dt>Tax ({taxPercent}%)</dt>
                    <dd>{money(quote.tax)}</dd>
                  </div>
                )}

                {toMinor(rawServicePercent) > 0 && (
                  <div className="flex items-center justify-between text-ivory-dim">
                    <div className="flex items-center gap-2">
                      <dt>Service charge ({rawServicePercent}%)</dt>
                      <button
                        type="button"
                        onClick={() => setIncludeServiceCharge(!includeServiceCharge)}
                        className="text-[10px] uppercase tracking-wider text-slate hover:underline"
                      >
                        {includeServiceCharge ? "[Remove]" : "[Add back]"}
                      </button>
                    </div>
                    <dd>{includeServiceCharge ? money(quote.serviceCharge) : "Opted out"}</dd>
                  </div>
                )}

                {savedMinor > 0 && (
                  <div className="flex justify-between text-ember">
                    <dt>Offer savings</dt>
                    <dd>− {money(fromMinor(savedMinor))}</dd>
                  </div>
                )}
              </dl>

              <div className="rule-fade my-5 h-px" />

              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Total</span>
                <span className="font-display text-3xl text-slate sm:text-4xl">
                  {money(quote.total)}
                </span>
              </div>

              {(() => {
                const totalMinor = toMinor(quote.total);
                const advanceInfo = calculateAdvanceDetails(totalMinor);

                if (!advanceInfo.isAdvanceRequired) return null;

                return (
                  <div className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3 text-xs leading-relaxed text-gold">
                    <span className="font-bold">⚡ Advance Required (&gt; ₹3,000):</span> An advance of{" "}
                    <strong>{advanceInfo.advancePercent}% ({money(fromMinor(advanceInfo.advanceMinor))})</strong>{" "}
                    is required for orders over ₹3,000 to start kitchen preparation.
                  </div>
                );
              })()}

              <p className="mt-3 text-[11px] leading-relaxed text-ivory-faint">
                Service charge is voluntary (CCPA guidelines). Payment is settled at the table.
              </p>

              <p className="mt-2 text-[10px] text-ivory-faint">
                🔒 <strong>Data Privacy Notice:</strong> Your contact details are stored securely solely to fulfill your order and handle table service. We do not sell your personal data.
              </p>
            </section>

            {placeOrder.isError && (
              <div className="mt-6">
                <LuxeError message={getErrorMessage(placeOrder.error)} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-20">
        <CustomerFooter />
      </div>

      {/* ------------------------------------------------------- action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-smoke bg-obsidian/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:gap-4 sm:px-6 sm:py-4">
          <Link to="/menu" className="shrink-0">
            <LuxeButton variant="ghost">Add more</LuxeButton>
          </Link>

          <LuxeButton
            className="flex-1"
            disabled={placeOrder.isPending}
            onClick={submit}
          >
            {placeOrder.isPending ? "Sending to the kitchen…" : "Place order"}
          </LuxeButton>
        </div>
      </div>
    </div>
  );
};

export default CustomerCart;
