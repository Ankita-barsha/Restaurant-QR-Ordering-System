/**
 * Order review and checkout.
 *
 * The request sends only foodId, quantity and notes. It deliberately carries
 * NO prices — the server recalculates every line from the database, so the
 * totals shown here are indicative and cannot be tampered with.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { LuxeButton, LuxeEmpty, LuxeError } from "../../components/luxe";
import { config } from "../../config/env";
import { useCart } from "../../context/CartContext";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import type { ApiResponse, Order, PublicSettings } from "../../types/api";

const fieldClass =
  "w-full rounded-xl border border-smoke bg-charcoal px-4 py-3 text-sm text-ivory placeholder:text-ivory-faint transition-colors focus:border-gold/50 focus:outline-none";

const CustomerCart = () => {
  const navigate = useNavigate();
  const {
    table,
    qrToken,
    items,
    itemCount,
    subtotal,
    increase,
    decrease,
    removeItem,
    setNotes,
    clearCart,
  } = useCart();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const placeOrder = useMutation({
    mutationFn: async () => {
      const payload = {
        qrToken: qrToken ?? undefined,
        customer:
          name || phone
            ? { name: name || undefined, phone: phone || undefined }
            : undefined,
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
      navigate(`/track/${order.orderNumber}`);
    },
  });

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

  const taxPercent = Number(settingsQuery.data?.taxPercent ?? "0");
  const estimatedTax = (Number(subtotal) * taxPercent) / 100;
  const estimatedTotal = Number(subtotal) + estimatedTax;

  return (
    <div className="min-h-screen bg-obsidian pb-40 pt-28">
      <div className="mx-auto max-w-3xl px-6">
        <header className="text-center">
          <p className="eyebrow">
            {table ? `Table ${table.tableNumber}` : "Takeaway"}
          </p>
          <h1 className="mt-3 text-[clamp(2.25rem,6vw,3.5rem)] leading-tight text-ivory">
            Your Order
          </h1>
          <div className="rule-fade mx-auto mt-5 h-px w-28" />
        </header>

        {/* ------------------------------------------------------ line items */}
        <div className="mt-12 divide-y divide-smoke border-y border-smoke">
          {items.map((item) => {
            const image = imageUrl(item.imageUrl, config.apiUrl);

            return (
              <div key={item.foodId} className="flex gap-5 py-6">
                {image ? (
                  <img
                    src={image}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-graphite text-2xl">
                    🍽️
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-xl leading-tight text-ivory">{item.name}</h2>
                    <span className="font-display shrink-0 text-xl text-gold">
                      {formatMoney(Number(item.price) * item.quantity)}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-ivory-faint">
                    {formatMoney(item.price)} each
                  </p>

                  <div className="mt-4 flex items-center gap-5">
                    <div className="flex items-center gap-4 rounded-full border border-smoke px-3 py-1.5">
                      <button
                        type="button"
                        onClick={() => decrease(item.foodId)}
                        aria-label={`One fewer ${item.name}`}
                        className="text-lg leading-none text-ivory-dim transition-colors hover:text-gold"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-sm text-ivory">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => increase(item.foodId)}
                        aria-label={`One more ${item.name}`}
                        className="text-lg leading-none text-ivory-dim transition-colors hover:text-gold"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.foodId)}
                      className="text-[10px] uppercase tracking-[0.2em] text-ivory-faint transition-colors hover:text-ember"
                    >
                      Remove
                    </button>
                  </div>

                  <input
                    type="text"
                    value={item.notes ?? ""}
                    onChange={(event) => setNotes(item.foodId, event.target.value)}
                    placeholder="A note for the kitchen"
                    className="mt-4 w-full rounded-lg border border-smoke bg-charcoal px-3 py-2 text-xs text-ivory placeholder:text-ivory-faint focus:border-gold/40 focus:outline-none"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* --------------------------------------------------------- details */}
        <section className="mt-12">
          <h2 className="text-2xl text-ivory">Your details</h2>
          <p className="mt-1.5 text-[13px] text-ivory-faint">
            Optional. A number lets us recognise you next time.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              aria-label="Your name"
              className={fieldClass}
            />
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone"
              inputMode="tel"
              aria-label="Your phone number"
              className={fieldClass}
            />
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
        <section className="glass rounded-luxe mt-12 p-7">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between text-ivory-dim">
              <dt>Subtotal</dt>
              <dd>{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-ivory-dim">
              <dt>Tax &amp; charges ({taxPercent}%)</dt>
              <dd>{formatMoney(estimatedTax)}</dd>
            </div>
          </dl>

          <div className="rule-fade my-5 h-px" />

          <div className="flex items-baseline justify-between">
            <span className="eyebrow">Total</span>
            <span className="font-display text-4xl text-gold">
              {formatMoney(estimatedTotal)}
            </span>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ivory-faint">
            Confirmed by the restaurant when your order is placed. Payment is
            settled at the table.
          </p>
        </section>

        {placeOrder.isError && (
          <div className="mt-6">
            <LuxeError message={getErrorMessage(placeOrder.error)} />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-smoke bg-obsidian/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          <Link to="/menu" className="shrink-0">
            <LuxeButton variant="ghost">Add more</LuxeButton>
          </Link>

          <LuxeButton
            className="flex-1"
            disabled={placeOrder.isPending}
            onClick={() => placeOrder.mutate()}
          >
            {placeOrder.isPending ? "Sending to the kitchen…" : "Place order"}
          </LuxeButton>
        </div>
      </div>
    </div>
  );
};

export default CustomerCart;
