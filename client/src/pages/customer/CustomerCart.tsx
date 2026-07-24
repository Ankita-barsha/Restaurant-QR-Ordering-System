/**
 * Cart and checkout.
 *
 * The order request sends only foodId + quantity + notes. It deliberately
 * sends NO prices: the server recalculates every line from the database, so
 * the totals shown here are indicative and cannot be tampered with.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button, EmptyState, ErrorBox } from "../../components/ui";
import { useCart } from "../../context/CartContext";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import type { ApiResponse, Order, PublicSettings } from "../../types/api";

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
          name || phone ? { name: name || undefined, phone: phone || undefined } : undefined,
        notes: orderNotes || undefined,
        // Only what and how many. No prices.
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
      // Straight to tracking, which subscribes to live status pushes.
      navigate(`/track/${order.orderNumber}`);
    },
  });

  if (itemCount === 0) {
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState
          title="Your cart is empty"
          hint="Add a few dishes from the menu to get started."
          icon={<span className="text-4xl">🛒</span>}
        />
        <Link to="/menu" className="mt-4 block">
          <Button className="w-full">Browse the menu</Button>
        </Link>
      </div>
    );
  }

  // Indicative tax, mirroring the server's rate so the diner is not surprised.
  const taxPercent = Number(settingsQuery.data?.taxPercent ?? "0");
  const estimatedTax = (Number(subtotal) * taxPercent) / 100;
  const estimatedTotal = Number(subtotal) + estimatedTax;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-4">
      <h1 className="text-xl font-bold text-slate-900">Your order</h1>

      {table && (
        <p className="mt-1 text-sm text-slate-500">
          Table <span className="font-semibold text-slate-900">{table.tableNumber}</span>
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div key={item.foodId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{item.name}</p>
                <p className="text-sm text-slate-500">{formatMoney(item.price)} each</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => decrease(item.foodId)}
                  className="h-8 w-8 rounded-lg bg-slate-100 text-lg font-bold text-slate-700"
                  aria-label={`Reduce ${item.name}`}
                >
                  −
                </button>
                <span className="w-5 text-center font-semibold">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => increase(item.foodId)}
                  className="h-8 w-8 rounded-lg bg-orange-500 text-lg font-bold text-white"
                  aria-label={`Add another ${item.name}`}
                >
                  +
                </button>
              </div>
            </div>

            <input
              type="text"
              value={item.notes ?? ""}
              onChange={(event) => setNotes(item.foodId, event.target.value)}
              placeholder="Any special request? e.g. no onions"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-500"
            />

            <button
              type="button"
              onClick={() => removeItem(item.foodId)}
              className="mt-2 text-xs font-medium text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Your details (optional)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Leave blank to order anonymously. A phone number lets us recognise you next time.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
          />
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Phone"
            inputMode="tel"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
          />
        </div>

        <textarea
          value={orderNotes}
          onChange={(event) => setOrderNotes(event.target.value)}
          placeholder="Notes for the kitchen"
          rows={2}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-orange-500"
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal)}</span>
        </div>
        <div className="mt-2 flex justify-between text-slate-600">
          <span>Tax ({taxPercent}%)</span>
          <span>{formatMoney(estimatedTax)}</span>
        </div>
        <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900">
          <span>Total</span>
          <span>{formatMoney(estimatedTotal)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Final total is confirmed by the restaurant when your order is placed.
        </p>
      </div>

      {placeOrder.isError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(placeOrder.error)} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Link to="/menu" className="flex-1">
            <Button variant="secondary" className="w-full">
              Add more
            </Button>
          </Link>
          <Button
            onClick={() => placeOrder.mutate()}
            disabled={placeOrder.isPending}
            className="flex-[2]"
          >
            {placeOrder.isPending ? "Placing order…" : `Place order · ${formatMoney(estimatedTotal)}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CustomerCart;
