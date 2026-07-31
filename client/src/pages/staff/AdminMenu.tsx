/**
 * Menu management — dishes and categories.
 *
 * Everything the restaurant serves is editable here: add a new dish with a
 * photo when it arrives, change a price, mark something sold out mid-service,
 * or retire it. Nothing about the menu is hard-coded, categories included.
 *
 * Sold-out and featured are one-tap controls on every row rather than buried
 * in the edit form. Sold-out is the action used most during a busy service,
 * and it broadcasts over the socket so diners' phones grey the dish out
 * instantly; featured decides what the public welcome page advertises, and an
 * admin changing their mind about tonight's recommendation should not have to
 * re-submit a price and a photo to do it.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import ImagePicker from "../../components/ImagePicker";
import Modal from "../../components/Modal";
import { Button, Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useAuth } from "../../context/auth";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import { fromMinor, toMinor } from "../../lib/money";
import {
  effectivePrice,
  offerBadge,
  offerProblem,
  previewOfferPrice,
  strikethroughPrice,
} from "../../lib/offer";
import type { ApiResponse, Category, Food, OfferType } from "../../types/api";

type Tab = "dishes" | "categories";

/** Shared input styling, so every field on the page matches. */
const inputClass =
  "w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20";

const Field = ({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-medium text-ivory-dim">{label}</span>
    {children}
    {hint && <span className="text-xs text-ivory-faint">{hint}</span>}
  </label>
);

const AdminMenu = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("dishes");

  const [dishForm, setDishForm] = useState<Food | "new" | null>(null);
  const [categoryForm, setCategoryForm] = useState<Category | "new" | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Food | Category | null>(null);

  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [price, setPrice] = useState("");
  const [offerEnabled, setOfferEnabled] = useState(false);
  const [offerType, setOfferType] = useState<OfferType>("PERCENTAGE");
  const [offerValue, setOfferValue] = useState("");
  const [offerLabel, setOfferLabel] = useState("");

  const categoriesQuery = useQuery({
    queryKey: [...queryKeys.categories, "admin"],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<Category[]>>("/categories?includeInactive=true&limit=100")
      ),
  });

  const foodsQuery = useQuery({
    queryKey: [...queryKeys.foods, "admin"],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<Food[]>>("/foods?includeUnavailable=true&limit=100")
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.foods });
    void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
  };

  const openDishForm = (food: Food | "new") => {
    const editing = food === "new" ? null : food;

    setDishForm(food);
    setImageFile(null);
    setSelectedCategoryId(editing?.categoryId ?? "");

    setPrice(editing?.price ?? "");
    setOfferEnabled(editing?.isOfferActive ?? false);
    setOfferType(editing?.offerType ?? "PERCENTAGE");
    setOfferValue(editing?.offerValue ?? "");
    setOfferLabel(editing?.offerLabel ?? "");
  };

  const closeDishForm = () => {
    setDishForm(null);
    setImageFile(null);
    setSelectedCategoryId("");
    setPrice("");
    setOfferEnabled(false);
    setOfferType("PERCENTAGE");
    setOfferValue("");
    setOfferLabel("");
  };

  const saveDish = useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: FormData }) => {
      const headers = { "Content-Type": undefined };

      return id
        ? api.patch(`/foods/${id}`, form, { headers })
        : api.post("/foods", form, { headers });
    },
    onSuccess: () => {
      closeDishForm();
      invalidate();
    },
  });

  const saveCategory = useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: Record<string, string> }) =>
      id
        ? unwrap(await api.patch<ApiResponse<Category>>(`/categories/${id}`, body))
        : unwrap(await api.post<ApiResponse<Category>>("/categories", body)),
    onSuccess: (category) => {
      setCategoryForm(null);

      if (dishForm !== null) setSelectedCategoryId(category.id);

      invalidate();
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.patch(`/foods/${id}/availability`, { isAvailable }),
    onSuccess: invalidate,
  });

  const toggleFeatured = useMutation({
    mutationFn: async ({ id, isFeatured }: { id: string; isFeatured: boolean }) =>
      api.patch(`/foods/${id}/featured`, { isFeatured }),
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: async (item: Food | Category) =>
      "price" in item
        ? api.delete(`/foods/${item.id}`)
        : api.delete(`/categories/${item.id}`),
    onSuccess: () => {
      setConfirmDelete(null);
      invalidate();
    },
  });

  if (foodsQuery.isLoading || categoriesQuery.isLoading) {
    return <Spinner label="Loading menu" />;
  }

  if (foodsQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(foodsQuery.error)}
        onRetry={() => void foodsQuery.refetch()}
      />
    );
  }

  const foods = foodsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const editingDish = dishForm !== "new" ? dishForm : null;
  const editingCategory = categoryForm !== "new" ? categoryForm : null;

  const submitDish = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    for (const [key, value] of [...form.entries()]) {
      if (typeof value === "string" && value.trim() === "") form.delete(key);
    }

    form.set("isVegetarian", form.get("isVegetarian") === "true" ? "true" : "false");
    form.set("isFeatured", form.get("isFeatured") === "true" ? "true" : "false");

    form.set("isOfferActive", offerEnabled ? "true" : "false");
    form.set("offerLabel", offerEnabled ? offerLabel.trim() : "");

    if (offerEnabled) {
      form.set("offerType", offerType);
      form.set("offerValue", offerValue.trim());
    } else {
      form.delete("offerType");
      form.delete("offerValue");
    }

    if (imageFile) form.set("image", imageFile);

    saveDish.mutate({ id: editingDish?.id, form });
  };

  const offerDraft = {
    isOfferActive: offerEnabled,
    offerType,
    offerValue,
    offerLabel,
  };

  const previewPrice = previewOfferPrice(price, offerDraft);
  const previewProblem = offerProblem(price, offerDraft);
  const previewSavingMinor =
    previewPrice !== null ? toMinor(price) - toMinor(previewPrice) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Menu Catalog</h1>
          <p className="mt-0.5 text-sm text-ivory-dim">
            {foods.length} dish{foods.length === 1 ? "" : "es"} across{" "}
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {tab === "dishes"
          ? can("food:create") && (
              <Button onClick={() => openDishForm("new")} className="font-bold uppercase tracking-wider text-xs">+ Add dish</Button>
            )
          : can("category:create") && (
              <Button onClick={() => setCategoryForm("new")} className="font-bold uppercase tracking-wider text-xs">+ Add category</Button>
            )}
      </div>

      <div className="flex gap-1 rounded-xl bg-graphite border border-smoke p-1">
        {(["dishes", "categories"] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
              tab === option
                ? "bg-gold text-obsidian shadow-sm font-bold"
                : "text-ivory-dim hover:text-ivory"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {(toggleAvailability.isError || toggleFeatured.isError || removeItem.isError) && (
        <div>
          <ErrorBox
            message={getErrorMessage(
              toggleAvailability.error ?? toggleFeatured.error ?? removeItem.error
            )}
          />
        </div>
      )}

      {/* ---------------- Dishes ---------------- */}
      {tab === "dishes" && (
        <div className="grid gap-3">
          {foods.length === 0 && (
            <EmptyState
              title="No dishes yet"
              hint="Add your first dish and it appears on the customer menu immediately."
              icon={<span className="text-4xl">🍽️</span>}
            />
          )}

          {foods.map((food) => {
            const image = imageUrl(food.imageUrl, config.apiUrl);

            return (
              <Card
                key={food.id}
                className={`flex flex-wrap items-center gap-3 p-4 bg-charcoal border border-smoke shadow-sm transition sm:flex-nowrap sm:gap-4 ${
                  food.isAvailable ? "" : "opacity-60"
                }`}
              >
                {image ? (
                  <img
                    src={image}
                    alt={food.name}
                    className={`h-16 w-16 shrink-0 rounded-xl object-cover border border-smoke sm:h-20 sm:w-20 ${
                      food.isAvailable ? "" : "grayscale"
                    }`}
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-graphite border border-smoke text-2xl sm:h-20 sm:w-20">
                    🍽️
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-sm ring-1 ${
                        food.isVegetarian ? "ring-emerald-500" : "ring-ember"
                      }`}
                      title={food.isVegetarian ? "Vegetarian" : "Non-vegetarian"}
                    >
                      <span
                        className={`block h-full w-full scale-50 rounded-full ${
                          food.isVegetarian ? "bg-emerald-500" : "bg-ember"
                        }`}
                      />
                    </span>
                    <p className="truncate font-semibold text-ivory text-base">{food.name}</p>
                    {!food.isAvailable && (
                      <span className="rounded-full bg-red-500/15 border border-red-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-red-400">
                        sold out
                      </span>
                    )}
                    {food.isFeatured && (
                      <span className="rounded-full bg-gold/15 border border-gold/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-gold">
                        ★ featured
                      </span>
                    )}
                    {offerBadge(food) && (
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                        {offerBadge(food)}
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 truncate text-xs text-ivory-dim font-medium">
                    {food.category.name}
                    {food.preparationMinutes ? ` · ${food.preparationMinutes} min cook` : ""}
                  </p>
                </div>

                <span className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold text-gold">
                  {formatMoney(effectivePrice(food))}
                  {strikethroughPrice(food) && (
                    <span className="text-xs font-medium text-ivory-faint line-through">
                      {formatMoney(strikethroughPrice(food) as string)}
                    </span>
                  )}
                </span>

                <div className="grid w-full grid-cols-2 gap-2 xs:grid-cols-4 sm:flex sm:w-auto">
                  {can("food:read") && (
                    <Button
                      variant={food.isAvailable ? "secondary" : "primary"}
                      disabled={toggleAvailability.isPending}
                      onClick={() =>
                        toggleAvailability.mutate({
                          id: food.id,
                          isAvailable: !food.isAvailable,
                        })
                      }
                      className="font-bold text-xs"
                    >
                      {food.isAvailable ? "Sold out" : "In stock"}
                    </Button>
                  )}

                  {can("food:update") && (
                    <Button
                      variant="secondary"
                      disabled={toggleFeatured.isPending}
                      className={`font-bold text-xs ${
                        food.isFeatured
                          ? "!bg-gold/20 !text-gold !border-gold/50"
                          : ""
                      }`}
                      onClick={() =>
                        toggleFeatured.mutate({
                          id: food.id,
                          isFeatured: !food.isFeatured,
                        })
                      }
                    >
                      {food.isFeatured ? "★ Featured" : "☆ Feature"}
                    </Button>
                  )}

                  {can("food:update") && (
                    <Button variant="secondary" onClick={() => openDishForm(food)} className="font-bold text-xs">
                      Edit
                    </Button>
                  )}

                  {can("food:delete") && (
                    <Button variant="ghost" onClick={() => setConfirmDelete(food)} className="font-bold text-xs">
                      Delete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------------- Categories ---------------- */}
      {tab === "categories" && (
        <div className="grid gap-3">
          {categories.length === 0 && (
            <EmptyState
              title="No categories yet"
              hint="Categories group the menu, e.g. Starters, Mains, Desserts."
            />
          )}

          {categories.map((category) => (
            <Card key={category.id} className="flex flex-wrap items-center gap-3 p-4 bg-charcoal border border-smoke sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ivory text-base">{category.name}</p>
                <p className="mt-0.5 text-xs text-ivory-dim">
                  {category._count?.foods ?? 0} dish
                  {(category._count?.foods ?? 0) === 1 ? "" : "es"}
                  {!category.isActive && " · hidden from customers"}
                </p>
              </div>

              <span className="rounded-full bg-graphite border border-smoke px-3 py-1 text-xs font-bold text-gold">
                order {category.sortOrder}
              </span>

              <div className="flex gap-2">
                {can("category:update") && (
                  <Button variant="secondary" onClick={() => setCategoryForm(category)} className="font-bold text-xs">
                    Edit
                  </Button>
                )}
                {can("category:delete") && (
                  <Button variant="ghost" onClick={() => setConfirmDelete(category)} className="font-bold text-xs">
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ---------------- Dish form ---------------- */}
      <Modal
        open={dishForm !== null}
        onClose={closeDishForm}
        title={editingDish ? "Edit dish" : "Add a dish"}
        description={
          editingDish
            ? "Changes appear on the customer menu straight away."
            : "It goes live on the customer menu as soon as you save."
        }
      >
        <form id="dish-form" onSubmit={submitDish} className="grid gap-4">
          <ImagePicker
            currentUrl={imageUrl(editingDish?.imageUrl ?? null, config.apiUrl)}
            onChange={setImageFile}
          />

          <Field label="Name">
            <input
              name="name"
              required
              defaultValue={editingDish?.name}
              placeholder="Paneer Butter Masala"
              className={inputClass}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" hint="The full price, before any offer">
              <input
                name="price"
                required
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="329.00"
                className={inputClass}
              />
            </Field>

            <Field
              label="Category"
              hint={
                can("category:create")
                  ? "Need a new one? Create it without leaving this form."
                  : undefined
              }
            >
              <div className="flex gap-2">
                <select
                  name="categoryId"
                  required
                  value={selectedCategoryId}
                  onChange={(event) => setSelectedCategoryId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>

                {can("category:create") && (
                  <button
                    type="button"
                    onClick={() => setCategoryForm("new")}
                    title="Create a category"
                    aria-label="Create a category"
                    className="shrink-0 rounded-lg border border-smoke bg-graphite px-3.5 text-lg font-bold text-gold transition hover:border-gold"
                  >
                    +
                  </button>
                )}
              </div>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              defaultValue={editingDish?.description ?? ""}
              placeholder="Creamy tomato gravy, kasuri methi"
              className={inputClass}
            />
          </Field>

          <Field
            label="Preparation & Preferences (Custom Modifiers)"
            hint="Optional. Comma-separated options (e.g. Less Sugar, Extra Chocolate, Almond Milk, Served Warm)"
          >
            <input
              name="customPreferences"
              defaultValue={((editingDish as Record<string, unknown> | null)?.customPreferences as string) ?? ""}
              placeholder="Less Sugar, Extra Chocolate, Almond Milk"
              className={inputClass}
            />
          </Field>

          <div className="grid items-end gap-4 sm:grid-cols-2">
            <Field label="Preparation time" hint="Minutes — helps the kitchen">
              <input
                name="preparationMinutes"
                inputMode="numeric"
                defaultValue={editingDish?.preparationMinutes ?? ""}
                placeholder="20"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-2">
              <label className="flex items-center gap-3 rounded-xl bg-graphite border border-smoke px-3 py-2.5">
                <input
                  type="checkbox"
                  name="isVegetarian"
                  value="true"
                  defaultChecked={editingDish?.isVegetarian ?? false}
                  className="h-4 w-4 accent-gold"
                />
                <span className="text-sm font-medium text-ivory">Vegetarian</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl bg-graphite border border-smoke px-3 py-2.5">
                <input
                  type="checkbox"
                  name="isFeatured"
                  value="true"
                  defaultChecked={editingDish?.isFeatured ?? false}
                  className="h-4 w-4 accent-gold"
                />
                <span className="text-sm font-medium text-ivory">
                  Chef's recommendation
                </span>
              </label>
            </div>
          </div>

          {/* ------------------------------------------------------ offer ---- */}
          <fieldset className="rounded-xl border border-smoke bg-graphite/30 p-4">
            <legend className="px-1 text-sm font-bold text-gold">
              Offer Config
            </legend>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={offerEnabled}
                onChange={(event) => setOfferEnabled(event.target.checked)}
                className="h-4 w-4 accent-gold"
              />
              <span className="text-sm font-medium text-ivory">
                Run an offer on this dish
              </span>
            </label>

            {offerEnabled && (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Discount type">
                    <select
                      value={offerType}
                      onChange={(event) =>
                        setOfferType(event.target.value as OfferType)
                      }
                      className={inputClass}
                    >
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="FIXED">Fixed amount</option>
                    </select>
                  </Field>

                  <Field
                    label={
                      offerType === "PERCENTAGE" ? "Discount %" : "Discount amount"
                    }
                    hint={
                      offerType === "PERCENTAGE"
                        ? "Between 0 and 100"
                        : "Taken off the price"
                    }
                  >
                    <input
                      inputMode="decimal"
                      value={offerValue}
                      onChange={(event) => setOfferValue(event.target.value)}
                      placeholder={offerType === "PERCENTAGE" ? "20" : "100"}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field
                  label="Badge text"
                  hint="Optional. Blank shows a badge worked out from the discount."
                >
                  <input
                    value={offerLabel}
                    onChange={(event) => setOfferLabel(event.target.value)}
                    placeholder={
                      offerType === "PERCENTAGE" && offerValue.trim()
                        ? `${offerValue.trim()}% OFF`
                        : "Limited Time Offer"
                    }
                    maxLength={40}
                    className={inputClass}
                  />
                </Field>

                {previewProblem ? (
                  <p className="rounded-xl bg-ember/15 border border-ember/30 px-4 py-3 text-sm text-ember">
                    {previewProblem}
                  </p>
                ) : (
                  previewPrice !== null && (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-400">
                          Offer price preview
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
                          <span className="text-xl font-bold text-emerald-300">
                            {formatMoney(previewPrice)}
                          </span>
                          <span className="text-sm text-ivory-faint line-through">
                            {formatMoney(price)}
                          </span>
                        </p>
                      </div>

                      <p className="text-xs font-bold text-emerald-400">
                        Guest saves {formatMoney(fromMinor(previewSavingMinor))}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}
          </fieldset>

          {saveDish.isError && <ErrorBox message={getErrorMessage(saveDish.error)} />}
        </form>

        <div className="mt-5 flex justify-end gap-2 border-t border-smoke pt-4">
          <Button variant="secondary" onClick={closeDishForm}>
            Cancel
          </Button>
          <button
            type="submit"
            form="dish-form"
            disabled={saveDish.isPending}
            className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-obsidian shadow-sm transition hover:bg-gold-light disabled:opacity-50"
          >
            {saveDish.isPending ? "Saving…" : editingDish ? "Save changes" : "Add dish"}
          </button>
        </div>
      </Modal>

      {/* ---------------- Category form ---------------- */}
      <Modal
        open={categoryForm !== null}
        onClose={() => setCategoryForm(null)}
        title={editingCategory ? "Edit category" : "Add a category"}
      >
        <form
          id="category-form"
          onSubmit={(event) => {
            event.preventDefault();

            const form = new FormData(event.currentTarget);
            const body: Record<string, string> = {};

            for (const [key, value] of form.entries()) {
              if (typeof value === "string" && value.trim() !== "") {
                body[key] = value.trim();
              }
            }

            body.isActive = form.get("isActive") === "true" ? "true" : "false";

            saveCategory.mutate({ id: editingCategory?.id, body });
          }}
          className="grid gap-4"
        >
          <Field label="Name">
            <input
              name="name"
              required
              defaultValue={editingCategory?.name}
              placeholder="Desserts"
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <input
              name="description"
              defaultValue={editingCategory?.description ?? ""}
              placeholder="Optional"
              className={inputClass}
            />
          </Field>

          <Field label="Display order" hint="Lower numbers appear first on the menu">
            <input
              name="sortOrder"
              inputMode="numeric"
              defaultValue={editingCategory?.sortOrder ?? 0}
              className={inputClass}
            />
          </Field>

          <label className="flex items-center gap-3 rounded-xl bg-graphite border border-smoke px-3 py-2.5">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={editingCategory?.isActive ?? true}
              className="h-4 w-4 accent-gold"
            />
            <span className="text-sm font-medium text-ivory">
              Visible to customers
            </span>
          </label>

          {saveCategory.isError && (
            <ErrorBox message={getErrorMessage(saveCategory.error)} />
          )}
        </form>

        <div className="mt-5 flex justify-end gap-2 border-t border-smoke pt-4">
          <Button variant="secondary" onClick={() => setCategoryForm(null)}>
            Cancel
          </Button>
          <button
            type="submit"
            form="category-form"
            disabled={saveCategory.isPending}
            className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-obsidian shadow-sm transition hover:bg-gold-light disabled:opacity-50"
          >
            {saveCategory.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      {/* ---------------- Delete confirmation ---------------- */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Remove from the menu?"
      >
        <p className="text-sm text-ivory-dim">
          <strong className="text-ivory font-bold">
            {confirmDelete && "name" in confirmDelete ? confirmDelete.name : ""}
          </strong>{" "}
          will stop appearing for customers.
        </p>

        <p className="mt-2 text-sm text-ivory-faint">
          Past orders keep it, so your sales history and receipts stay accurate.
        </p>

        {confirmDelete && !("price" in confirmDelete) && (
          <p className="mt-2 text-sm text-ivory-faint">
            {(confirmDelete._count?.foods ?? 0) > 0
              ? `This category still holds ${confirmDelete._count?.foods} dish${
                  confirmDelete._count?.foods === 1 ? "" : "es"
                }. Move or remove them first — a category cannot be deleted while dishes point at it.`
              : "No dishes belong to this category, so it can be removed safely."}
          </p>
        )}

        {removeItem.isError && (
          <div className="mt-3">
            <ErrorBox message={getErrorMessage(removeItem.error)} />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-smoke pt-4">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={removeItem.isPending}
            onClick={() => confirmDelete && removeItem.mutate(confirmDelete)}
          >
            {removeItem.isPending ? "Removing…" : "Remove"}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default AdminMenu;
