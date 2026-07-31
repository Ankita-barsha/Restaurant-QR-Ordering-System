/**
 * Dish detail & modifier sheet (#29).
 *
 * Allows diners to inspect dish details, select category-smart preparation options
 * (doneness for meats, sugar/milk for beverages, spice for curries, toppings for desserts),
 * add special instructions, and add to cart.
 */

import { useEffect, useState } from "react";

import { config } from "../config/env";
import { formatMoney, imageUrl } from "../lib/format";
import { fromMinor } from "../lib/money";
import {
  effectivePrice,
  offerBadge,
  savingMinor,
  strikethroughPrice,
} from "../lib/offer";
import type { Food } from "../types/api";
import { DietMark, LuxeButton, OfferBadge, PriceTag } from "./luxe";

/**
 * Returns context-aware, category-smart preparation preferences.
 * Ensures Desserts show dessert options, Beverages show drink options,
 * Meats show doneness options, and Curries show spice levels.
 */
const getCategoryPreferences = (categoryName?: string, foodName?: string): string[] => {
  const cat = (categoryName ?? "").toLowerCase();
  const name = (foodName ?? "").toLowerCase();

  if (cat.includes("dessert") || name.includes("cake") || name.includes("ice cream") || name.includes("sweet")) {
    return ["Less Sugar", "Extra Chocolate", "No Nuts", "Served Warm", "With Ice Cream", "Eggless"];
  }

  if (
    cat.includes("beverage") ||
    cat.includes("drink") ||
    cat.includes("coffee") ||
    name.includes("soda") ||
    name.includes("latte") ||
    name.includes("tea")
  ) {
    return ["Less Ice", "No Sugar", "Extra Ice", "Oat Milk", "Almond Milk", "Less Sweet"];
  }

  if (cat.includes("burger") || name.includes("steak") || name.includes("burger")) {
    return ["Medium Rare", "Medium Well", "Well Done", "Extra Cheese", "No Onions", "Gluten Free"];
  }

  if (cat.includes("pizza") || cat.includes("pasta") || cat.includes("italian")) {
    return ["Extra Cheese", "Crispy Crust", "Less Cheese", "Gluten Free", "No Garlic"];
  }

  if (
    cat.includes("indian") ||
    name.includes("curry") ||
    name.includes("tikka") ||
    name.includes("masala") ||
    name.includes("biryani") ||
    name.includes("naan")
  ) {
    return ["Less Spicy", "Medium Spicy", "Extra Spicy", "Less Oil", "No Onion & Garlic", "Extra Butter"];
  }

  return ["Less Spicy", "Extra Spicy", "No Onions", "Extra Cheese", "Gluten Free"];
};

const DishSheet = ({
  food,
  onClose,
  onAdd,
}: {
  food: Food | null;
  onClose: () => void;
  onAdd: (food: Food, notes?: string) => void;
}) => {
  const [selectedPreference, setSelectedPreference] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState<string>("");

  useEffect(() => {
    if (!food) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [food, onClose]);

  if (!food) return null;

  const image = imageUrl(food.imageUrl, config.apiUrl);
  const badge = offerBadge(food);
  const listPrice = strikethroughPrice(food);
  const saving = savingMinor(food);

  const preferences =
    typeof food.customPreferences === "string" &&
    food.customPreferences.trim().length > 0
      ? food.customPreferences
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : getCategoryPreferences(food.category?.name, food.name);

  const handleAdd = () => {
    const parts = [selectedPreference, customInstructions.trim()].filter(Boolean);
    const notes = parts.length > 0 ? parts.join(" • ") : undefined;
    onAdd(food, notes);
  };

  return (
    <div
      className="animate-fade fixed inset-0 z-50 flex items-end justify-center bg-obsidian/80 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={food.name}
        onClick={(event) => event.stopPropagation()}
        className="animate-rise max-h-[92svh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-luxe border border-smoke bg-charcoal sm:rounded-luxe"
      >
        <div className="relative">
          {image ? (
            <img src={image} alt={food.name} className="h-64 w-full object-cover sm:h-72" />
          ) : (
            <div className="flex h-64 w-full items-center justify-center bg-graphite text-5xl">
              🍽️
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-transparent opacity-0 dark:opacity-100 transition-opacity" />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="glass absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-ivory transition hover:text-slate"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {badge && (
            <OfferBadge label={badge} className="absolute bottom-4 left-4 sm:left-5" />
          )}

          <span className="absolute inset-x-0 top-2 mx-auto h-1 w-10 rounded-full bg-ivory/25 sm:hidden" />
        </div>

        <div className="p-5 sm:p-7">
          <div className="flex items-center gap-2.5">
            <DietMark vegetarian={food.isVegetarian} />
            <span className="eyebrow">{food.category.name}</span>
          </div>

          <h2 className="mt-3 text-[clamp(1.75rem,7vw,2.25rem)] leading-tight text-ivory">
            {food.name}
          </h2>

          {food.description && (
            <p className="mt-4 text-[15px] leading-loose text-ivory-dim">
              {food.description}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-1 gap-5 border-y border-smoke py-6 xs:grid-cols-2 sm:mt-7">
            <div>
              <dt className="eyebrow">Price</dt>
              <dd className="mt-1.5">
                <PriceTag
                  size="lg"
                  price={formatMoney(effectivePrice(food))}
                  listPrice={listPrice && formatMoney(listPrice)}
                />
              </dd>
              {saving > 0 && (
                <dd className="mt-1 text-[11px] uppercase tracking-[0.16em] text-ember">
                  You save {formatMoney(fromMinor(saving))}
                </dd>
              )}
            </div>

            {food.preparationMinutes !== null && (
              <div>
                <dt className="eyebrow">Prepared in</dt>
                <dd className="font-display mt-1.5 text-3xl text-ivory">
                  {food.preparationMinutes} min
                </dd>
              </div>
            )}
          </dl>

          {/* -------------------------------- Modifiers & Preferences (#29) */}
          <div className="mt-6">
            <p className="eyebrow text-slate">Preparation & Preferences</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {preferences.map((pref) => {
                const active = selectedPreference === pref;
                return (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => setSelectedPreference(active ? null : pref)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-gold bg-gold text-obsidian font-bold"
                        : "border-smoke bg-graphite text-ivory-dim hover:border-gold/40 hover:text-ivory"
                    }`}
                  >
                    {pref}
                  </button>
                );
              })}
            </div>

            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Special instructions for the chef (optional)..."
              rows={2}
              className="mt-4 w-full rounded-xl border border-smoke bg-graphite p-3 text-xs text-ivory placeholder-ivory-faint focus:border-gold focus:outline-none"
            />
          </div>

          {food.isAvailable ? (
            <LuxeButton className="mt-7 w-full" onClick={handleAdd}>
              Add to order
            </LuxeButton>
          ) : (
            <p className="mt-7 rounded-full border border-ember/40 px-6 py-3.5 text-center text-[11px] uppercase tracking-[0.2em] text-ember">
              Sold out this evening
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DishSheet;
