/**
 * The menu.
 *
 * Two jobs at once: a dining-room menu that reads beautifully, and an
 * ordering screen that must be quick on a phone with one hand. The layout
 * favours the photograph, but the add control is always reachable with a
 * thumb and never hidden behind a hover.
 *
 * Live: when the kitchen marks a dish sold out, the socket invalidates this
 * query and the card dims without a refresh.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import CustomerFooter from "../../components/CustomerFooter";
import {
  DietMark,
  LuxeButton,
  LuxeEmpty,
  LuxeError,
  LuxeSkeleton,
  OfferBadge,
  PriceTag,
  Reveal,
} from "../../components/luxe";
import DishSheet from "../../components/DishSheet";
import { config } from "../../config/env";
import { useCart } from "../../context/cart";
import { useFavourites } from "../../context/favourites";
import { queryKeys, useLiveOrders } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import { effectivePrice, offerBadge, strikethroughPrice } from "../../lib/offer";
import type { ApiResponse, Category, Food } from "../../types/api";

const CustomerMenu = () => {
  const [searchParams] = useSearchParams();
  const initialCategoryParam = searchParams.get("category");

  const [search, setSearch] = useState("");
  const [userSelectedCategory, setUserSelectedCategory] = useState<string | null>(null);
  const [userClearedCategory, setUserClearedCategory] = useState(false);
  const [vegOnly, setVegOnly] = useState(false);
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [offersOnly, setOffersOnly] = useState(false);
  const [openDish, setOpenDish] = useState<Food | null>(null);

  const { table, items, itemCount, addItem, increase, decrease, subtotal } = useCart();
  const { isFavourite, toggle: toggleFavourite, count: favouriteCount } = useFavourites();

  useLiveOrders();

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => unwrap(await api.get<ApiResponse<Category[]>>("/categories")),
  });

  // Derived category slug: user selection > matched query param > null
  const categorySlug = useMemo(() => {
    if (userClearedCategory) return null;
    if (userSelectedCategory) return userSelectedCategory;
    if (initialCategoryParam && categoriesQuery.data && categoriesQuery.data.length > 0) {
      const paramLower = initialCategoryParam.toLowerCase();
      const matched = categoriesQuery.data.find(
        (c) =>
          c.slug.toLowerCase() === paramLower ||
          c.name.toLowerCase() === paramLower ||
          (paramLower === "drinks" && c.name.toLowerCase().includes("bev")) ||
          (paramLower === "drinks" && c.slug.toLowerCase().includes("bev"))
      );
      if (matched) return matched.slug;
    }
    return initialCategoryParam;
  }, [userClearedCategory, userSelectedCategory, initialCategoryParam, categoriesQuery.data]);

  const selectCategory = (slug: string | null) => {
    if (slug === null) {
      setUserClearedCategory(true);
      setUserSelectedCategory(null);
    } else {
      setUserClearedCategory(false);
      setUserSelectedCategory(slug);
    }
  };

  const foodsQuery = useQuery({
    queryKey: [...queryKeys.foods, search, categorySlug, vegOnly, offersOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });

      if (search) params.set("search", search);
      if (categorySlug) params.set("category", categorySlug);
      if (vegOnly) params.set("isVegetarian", "true");
      // Filtered server-side, unlike favourites: whether a dish is on offer is
      // something the database knows and the device does not.
      if (offersOnly) params.set("isOfferActive", "true");

      return unwrap(await api.get<ApiResponse<Food[]>>(`/foods?${params.toString()}`));
    },
  });

  const inCart = useMemo(
    () => new Map(items.map((item) => [item.foodId, item.quantity])),
    [items]
  );

  // Filtered here, not on the server: favourites live on the device and the
  // API has no idea which dishes this diner has starred.
  const foods = (foodsQuery.data ?? []).filter(
    (food) => !favouritesOnly || isFavourite(food.id)
  );

  return (
    <div className="min-h-screen bg-obsidian pb-32">
      {/* ------------------------------------------------------ page header */}
      <header className="border-b border-smoke px-4 pb-8 pt-12 sm:px-6 sm:pb-10 sm:pt-14">
        <div className="mx-auto max-w-6xl text-center">
          <p className="eyebrow animate-rise">
            {table ? `Table ${table.tableNumber}` : "À la carte"}
          </p>

          <h1 className="animate-rise delay-1 mt-4 text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] text-ivory">
            The Menu
          </h1>

          <div className="rule-fade animate-rise delay-2 mx-auto mt-6 h-px w-32" />
        </div>
      </header>

      {/* -------------------------------------------------- search & filters */}
      <div className="sticky top-[68px] z-30 border-b border-smoke bg-obsidian/85 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ivory-faint"
              width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.5"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>

            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search the menu"
              aria-label="Search the menu"
              className="w-full rounded-full border border-smoke bg-charcoal py-3 pl-11 pr-4 text-base text-ivory placeholder:text-ivory-faint focus:border-gold/50 focus:outline-none sm:text-sm"
            />
          </div>

          {/* Horizontal scroll rather than wrapping: a wrapping filter row
              pushes the menu down the page on a phone. */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterPill
              active={categorySlug === null}
              onClick={() => selectCategory(null)}
            >
              All
            </FilterPill>

            {categoriesQuery.data?.map((category) => (
              <FilterPill
                key={category.id}
                active={categorySlug === category.slug}
                onClick={() => selectCategory(category.slug)}
              >
                {category.name}
              </FilterPill>
            ))}

            <FilterPill active={vegOnly} onClick={() => setVegOnly((value) => !value)}>
              <DietMark vegetarian />
              Vegetarian
            </FilterPill>

            <FilterPill
              active={offersOnly}
              onClick={() => setOffersOnly((value) => !value)}
            >
              Offers
            </FilterPill>

            {favouriteCount > 0 && (
              <FilterPill
                active={favouritesOnly}
                onClick={() => setFavouritesOnly((value) => !value)}
              >
                <HeartIcon filled={favouritesOnly} />
                Favourites
              </FilterPill>
            )}
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------- the dishes */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {foodsQuery.isLoading && (
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <LuxeSkeleton key={index} className="h-[360px]" />
            ))}
          </div>
        )}

        {foodsQuery.isError && (
          <LuxeError
            message={getErrorMessage(foodsQuery.error)}
            onRetry={() => void foodsQuery.refetch()}
          />
        )}

        {!foodsQuery.isLoading && foods.length === 0 && (
          <LuxeEmpty
            title={favouritesOnly ? "No favourites yet" : "Nothing matches that"}
            hint={
              favouritesOnly
                ? "Tap the heart on a dish to save it here."
                : "Try another search, or clear the filters to see the full menu."
            }
            action={
              <LuxeButton
                variant="outline"
                onClick={() => {
                  setSearch("");
                  selectCategory(null);
                  setVegOnly(false);
                  setFavouritesOnly(false);
                  setOffersOnly(false);
                }}
              >
                Show everything
              </LuxeButton>
            }
          />
        )}

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {foods.map((food, index) => {
            const image = imageUrl(food.imageUrl, config.apiUrl);
            const quantity = inCart.get(food.id) ?? 0;
            const badge = offerBadge(food);
            const listPrice = strikethroughPrice(food);

            return (
              <Reveal key={food.id} delay={Math.min(index, 5) * 70}>
                <article className="group relative flex h-full flex-col overflow-hidden rounded-luxe border border-smoke bg-charcoal transition-colors duration-500 hover:border-gold/30">
                  <button
                    type="button"
                    onClick={() => setOpenDish(food)}
                    className="relative block aspect-[4/3] w-full overflow-hidden"
                    aria-label={`View ${food.name}`}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={food.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-graphite text-3xl">
                        🍽️
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 to-transparent opacity-0 dark:opacity-100 transition-opacity" />

                    {quantity > 0 && (
                      <span className="absolute left-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-full bg-gold px-2 text-xs font-medium text-obsidian">
                        {quantity}
                      </span>
                    )}
                  </button>

                  {/* Bottom-left of the photo, clear of the quantity pill above
                      it and the favourite button opposite. */}
                  {badge && (
                    <OfferBadge
                      label={badge}
                      className="pointer-events-none absolute bottom-3 left-3"
                    />
                  )}

                  {/* Outside the photo button: nesting a button inside a
                      button is invalid HTML and breaks keyboard navigation. */}
                  <button
                    type="button"
                    onClick={() => toggleFavourite(food.id)}
                    aria-pressed={isFavourite(food.id)}
                    aria-label={
                      isFavourite(food.id)
                        ? `Remove ${food.name} from favourites`
                        : `Save ${food.name} to favourites`
                    }
                    className="glass absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full transition-transform duration-500 hover:scale-110"
                  >
                    <HeartIcon filled={isFavourite(food.id)} />
                  </button>

                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5">
                        <DietMark vegetarian={food.isVegetarian} />
                      </span>

                      <h3 className="flex-1 text-2xl leading-tight text-ivory">
                        {food.name}
                      </h3>
                    </div>

                    {food.description && (
                      <p className="mt-2.5 line-clamp-2 text-[13px] leading-relaxed text-ivory-faint">
                        {food.description}
                      </p>
                    )}

                    {/* Wraps rather than compressing: with a struck-through
                        original beside the price, a fixed row squeezed the Add
                        button off the card at 320px. */}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-6">
                      <PriceTag
                        price={formatMoney(effectivePrice(food))}
                        listPrice={listPrice && formatMoney(listPrice)}
                      />

                      {quantity === 0 ? (
                        <button
                          type="button"
                          onClick={() => addItem(food)}
                          aria-label={`Add ${food.name} to your order`}
                          className="min-h-11 rounded-full border border-gold/40 px-6 py-2.5 text-[10px] uppercase tracking-[0.2em] text-slate transition-all duration-500 hover:bg-gold hover:text-obsidian font-bold"
                        >
                          Add
                        </button>
                      ) : (
                        <div className="flex min-h-11 items-center gap-1.5 rounded-full border border-gold bg-gold/15 px-2 py-1">
                          <button
                            type="button"
                            onClick={() => decrease(food.id)}
                            aria-label={`Decrease ${food.name} quantity`}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-slate transition hover:bg-gold hover:text-obsidian font-bold text-base"
                          >
                            −
                          </button>
                          <span className="min-w-6 text-center font-bold text-sm text-slate tabular-nums">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => increase(food.id)}
                            aria-label={`Increase ${food.name} quantity`}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-obsidian transition hover:bg-gold-light font-bold text-base"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* -------------------------------------------------------- cart bar */}
      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4">
          <Link
            to="/cart"
            className="glass mx-auto flex min-h-14 max-w-2xl items-center justify-between gap-3 rounded-full px-5 py-3.5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] transition-transform duration-500 hover:scale-[1.02] sm:gap-4 sm:px-6 sm:py-4"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold text-sm font-medium text-obsidian">
                {itemCount}
              </span>
              <span className="text-sm text-ivory-dim">
                {formatMoney(subtotal)}
              </span>
            </span>

            <span className="text-[11px] uppercase tracking-[0.24em] text-gold font-bold">
              View order →
            </span>
          </Link>
        </div>
      )}

      <CustomerFooter />

      <DishSheet
        food={openDish}
        onClose={() => setOpenDish(null)}
        onAdd={(food) => {
          addItem(food);
          setOpenDish(null);
        }}
      />
    </div>
  );
};

/** Heart outline when unsaved, solid gold when saved. */
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.6"
    className={filled ? "text-gold" : "text-ivory"}
  >
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.7 1.1-1a5.5 5.5 0 0 0 0-7.9z" />
  </svg>
);

const FilterPill = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-5 py-2 text-[11px] uppercase tracking-[0.18em] transition-all duration-300 font-bold ${
      active
        ? "border-gold bg-gold text-obsidian shadow-md"
        : "border-smoke bg-graphite/40 text-ivory-dim hover:border-gold/50 hover:text-ivory"
    }`}
  >
    {children}
  </button>
);

export default CustomerMenu;
