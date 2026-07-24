/**
 * Customer menu — browse, search, filter by category, add to cart.
 *
 * Live: when a chef marks an item sold out, the socket invalidates the menu
 * query and the card greys out without a refresh.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useCart } from "../../context/CartContext";
import { queryKeys, useLiveOrders } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import type { ApiResponse, Category, Food } from "../../types/api";

const CustomerMenu = () => {
  const [search, setSearch] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [vegOnly, setVegOnly] = useState(false);

  const { table, items, itemCount, addItem, subtotal } = useCart();

  // Keeps the menu in sync when the kitchen marks something sold out.
  useLiveOrders();

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => unwrap(await api.get<ApiResponse<Category[]>>("/categories")),
  });

  const foodsQuery = useQuery({
    queryKey: [...queryKeys.foods, search, categorySlug, vegOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });

      if (search) params.set("search", search);
      if (categorySlug) params.set("category", categorySlug);
      if (vegOnly) params.set("isVegetarian", "true");

      return unwrap(await api.get<ApiResponse<Food[]>>(`/foods?${params.toString()}`));
    },
  });

  const inCart = useMemo(
    () => new Map(items.map((item) => [item.foodId, item.quantity])),
    [items]
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-4">
      {table && (
        <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
          <span className="text-sm opacity-80">Ordering for</span>
          <span className="text-lg font-bold">Table {table.tableNumber}</span>
        </div>
      )}

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search dishes…"
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-orange-500"
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => setCategorySlug(null)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
            categorySlug === null
              ? "bg-orange-500 text-white"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          All
        </button>

        {categoriesQuery.data?.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategorySlug(category.slug)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
              categorySlug === category.slug
                ? "bg-orange-500 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {category.name}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setVegOnly((previous) => !previous)}
          className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
            vegOnly ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
          }`}
        >
          Veg only
        </button>
      </div>

      {foodsQuery.isLoading && <Spinner label="Loading menu" />}

      {foodsQuery.isError && (
        <ErrorBox
          message={getErrorMessage(foodsQuery.error)}
          onRetry={() => void foodsQuery.refetch()}
        />
      )}

      {foodsQuery.data?.length === 0 && (
        <EmptyState title="No dishes found" hint="Try a different search or category." />
      )}

      <div className="mt-4 grid gap-3">
        {foodsQuery.data?.map((food) => {
          const image = imageUrl(food.imageUrl, config.apiUrl);
          const quantity = inCart.get(food.id) ?? 0;

          return (
            <article
              key={food.id}
              className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-3"
            >
              {image ? (
                <img
                  src={image}
                  alt={food.name}
                  className="h-24 w-24 shrink-0 rounded-xl object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                  🍽️
                </div>
              )}

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 rounded-sm ring-1 ${
                      food.isVegetarian ? "ring-green-600" : "ring-red-600"
                    }`}
                    title={food.isVegetarian ? "Vegetarian" : "Non-vegetarian"}
                  >
                    <span
                      className={`block h-full w-full scale-50 rounded-full ${
                        food.isVegetarian ? "bg-green-600" : "bg-red-600"
                      }`}
                    />
                  </span>
                  <h3 className="truncate font-semibold text-slate-900">{food.name}</h3>
                </div>

                {food.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                    {food.description}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="font-bold text-slate-900">
                    {formatMoney(food.price)}
                  </span>

                  <button
                    type="button"
                    onClick={() => addItem(food)}
                    className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    {quantity > 0 ? `Add · ${quantity}` : "Add"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Sticky cart bar — the diner always knows what they have selected. */}
      {itemCount > 0 && (
        <Link
          to="/cart"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-3xl items-center justify-between bg-slate-900 px-5 py-4 text-white md:bottom-4 md:rounded-2xl"
        >
          <span className="text-sm">
            {itemCount} item{itemCount > 1 ? "s" : ""} · {formatMoney(subtotal)}
          </span>
          <span className="font-semibold">View cart →</span>
        </Link>
      )}
    </div>
  );
};

export default CustomerMenu;
