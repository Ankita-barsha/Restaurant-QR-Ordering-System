/**
 * Dish detail sheet.
 *
 * Slides up from the bottom on a phone and centres on a desktop. A sheet
 * rather than a route because the diner is browsing: pushing a full page and
 * making them navigate back loses their place in a long menu.
 */

import { useEffect } from "react";

import { config } from "../config/env";
import { formatMoney, imageUrl } from "../lib/format";
import type { Food } from "../types/api";
import { DietMark, LuxeButton } from "./luxe";

const DishSheet = ({
  food,
  onClose,
  onAdd,
}: {
  food: Food | null;
  onClose: () => void;
  onAdd: (food: Food) => void;
}) => {
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
        className="animate-rise max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-luxe border border-smoke bg-charcoal sm:rounded-luxe"
      >
        <div className="relative">
          {image ? (
            <img src={image} alt={food.name} className="h-64 w-full object-cover sm:h-72" />
          ) : (
            <div className="flex h-64 w-full items-center justify-center bg-graphite text-5xl">
              🍽️
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-transparent to-transparent" />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="glass absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-ivory transition hover:text-gold"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Grab handle — signals "drag to dismiss" on touch, harmless on desktop */}
          <span className="absolute inset-x-0 top-2 mx-auto h-1 w-10 rounded-full bg-ivory/25 sm:hidden" />
        </div>

        <div className="p-7">
          <div className="flex items-center gap-2.5">
            <DietMark vegetarian={food.isVegetarian} />
            <span className="eyebrow">{food.category.name}</span>
          </div>

          <h2 className="mt-3 text-4xl leading-tight text-ivory">{food.name}</h2>

          {food.description && (
            <p className="mt-4 text-[15px] leading-loose text-ivory-dim">
              {food.description}
            </p>
          )}

          <dl className="mt-7 grid grid-cols-2 gap-5 border-y border-smoke py-6">
            <div>
              <dt className="eyebrow">Price</dt>
              <dd className="font-display mt-1.5 text-3xl text-gold">
                {formatMoney(food.price)}
              </dd>
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

          {food.isAvailable ? (
            <LuxeButton className="mt-7 w-full" onClick={() => onAdd(food)}>
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
