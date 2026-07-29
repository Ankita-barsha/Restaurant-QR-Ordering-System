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
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

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
    <span className="text-sm font-medium text-slate-700">{label}</span>
    {children}
    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </label>
);

const AdminMenu = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("dishes");

  // null = closed, "new" = create, otherwise the record being edited.
  const [dishForm, setDishForm] = useState<Food | "new" | null>(null);
  const [categoryForm, setCategoryForm] = useState<Category | "new" | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Food | Category | null>(null);

  /**
   * The category the dish form has selected.
   *
   * Controlled rather than left to `defaultValue`, so that a category created
   * from inside the dish form can be selected the moment it exists. With an
   * uncontrolled select the admin would create "Desserts", return to a form
   * that had reset to "Choose…", and have to find it again.
   */
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  /**
   * The offer fields, held in state rather than left uncontrolled.
   *
   * The brief calls for the offer price to appear "in real time without
   * requiring manual input", and a preview cannot react to inputs the
   * component does not observe. The price is here for the same reason — a
   * percentage discount is meaningless without it, so editing the price has to
   * move the preview too.
   */
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
    // A dish that has never had an offer opens on the commoner of the two
    // types rather than on an empty select.
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

  /**
   * Create and update both post multipart/form-data, because either may carry
   * a photo. Content-Type is set to undefined so the browser supplies it WITH
   * the multipart boundary — setting it by hand produces a body multer cannot
   * parse.
   */
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

      // A category created while adding a dish is selected straight away, so
      // the admin carries on from where they were rather than hunting for it.
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

    // Blank optional fields are dropped rather than sent as "", which the
    // server's optional string schemas reject.
    for (const [key, value] of [...form.entries()]) {
      if (typeof value === "string" && value.trim() === "") form.delete(key);
    }

    // Checkboxes are absent when unchecked, so every boolean is set
    // explicitly — otherwise unticking "vegetarian" would never save.
    form.set("isVegetarian", form.get("isVegetarian") === "true" ? "true" : "false");
    form.set("isFeatured", form.get("isFeatured") === "true" ? "true" : "false");

    /**
     * The offer fields are set from state, not read out of the form.
     *
     * They are controlled inputs driving the live preview, and the blank-field
     * strip above would have deleted an empty label anyway. Sending the label
     * explicitly — as "" when cleared — is what lets an admin REMOVE a custom
     * badge; omitting it would mean "unchanged" and the old wording would
     * stick forever.
     *
     * offerPrice is deliberately absent. The server derives it.
     */
    form.set("isOfferActive", offerEnabled ? "true" : "false");
    form.set("offerLabel", offerEnabled ? offerLabel.trim() : "");

    if (offerEnabled) {
      form.set("offerType", offerType);
      form.set("offerValue", offerValue.trim());
    } else {
      // Left out entirely when off: the server keeps the stored discount so a
      // seasonal offer can be switched back on without re-entering it.
      form.delete("offerType");
      form.delete("offerValue");
    }

    if (imageFile) form.set("image", imageFile);

    saveDish.mutate({ id: editingDish?.id, form });
  };

  /** The live preview, and the reason it cannot be shown. */
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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Menu</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {foods.length} dish{foods.length === 1 ? "" : "es"} across{" "}
            {categories.length} categor{categories.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {tab === "dishes"
          ? can("food:create") && (
              <Button onClick={() => openDishForm("new")}>+ Add dish</Button>
            )
          : can("category:create") && (
              <Button onClick={() => setCategoryForm("new")}>+ Add category</Button>
            )}
      </div>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {(["dishes", "categories"] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
              tab === option
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {(toggleAvailability.isError || toggleFeatured.isError || removeItem.isError) && (
        <div className="mt-4">
          <ErrorBox
            message={getErrorMessage(
              toggleAvailability.error ?? toggleFeatured.error ?? removeItem.error
            )}
          />
        </div>
      )}

      {/* ---------------- Dishes ---------------- */}
      {tab === "dishes" && (
        <div className="mt-4 grid gap-3">
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
                className={`flex flex-wrap items-center gap-3 p-3 transition sm:flex-nowrap sm:gap-4 ${
                  food.isAvailable ? "" : "bg-slate-50"
                }`}
              >
                {image ? (
                  <img
                    src={image}
                    alt={food.name}
                    className={`h-16 w-16 shrink-0 rounded-xl object-cover sm:h-20 sm:w-20 ${
                      food.isAvailable ? "" : "grayscale"
                    }`}
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl sm:h-20 sm:w-20">
                    🍽️
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-3 w-3 shrink-0 rounded-sm ring-1 ${
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
                    <p className="truncate font-semibold text-slate-900">{food.name}</p>
                    {!food.isAvailable && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                        sold out
                      </span>
                    )}
                    {food.isFeatured && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                        ★ featured
                      </span>
                    )}
                    {offerBadge(food) && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                        {offerBadge(food)}
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {food.category.name}
                    {food.preparationMinutes ? ` · ${food.preparationMinutes} min` : ""}
                  </p>
                </div>

                {/* The selling price leads, with the list price struck through
                    beside it — the same order the customer menu uses. */}
                <span className="flex flex-wrap items-baseline gap-x-2 text-base font-bold text-slate-900">
                  {formatMoney(effectivePrice(food))}
                  {strikethroughPrice(food) && (
                    <span className="text-xs font-medium text-slate-400 line-through">
                      {formatMoney(strikethroughPrice(food) as string)}
                    </span>
                  )}
                </span>

                {/* Four actions do not fit one phone-width row. A 2-up grid
                    below sm keeps every one of them on screen and at a size a
                    thumb can hit; from sm they sit in a row as before. */}
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
                    >
                      {food.isAvailable ? "Sold out" : "In stock"}
                    </Button>
                  )}

                  {/* Featuring is what the welcome page advertises, so it sits
                      beside sold-out rather than inside the edit form. */}
                  {can("food:update") && (
                    <Button
                      variant="secondary"
                      disabled={toggleFeatured.isPending}
                      className={
                        food.isFeatured
                          ? "!bg-amber-50 !text-amber-700 !ring-amber-300"
                          : ""
                      }
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
                    <Button variant="secondary" onClick={() => openDishForm(food)}>
                      Edit
                    </Button>
                  )}

                  {can("food:delete") && (
                    <Button variant="ghost" onClick={() => setConfirmDelete(food)}>
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
        <div className="mt-4 grid gap-3">
          {categories.length === 0 && (
            <EmptyState
              title="No categories yet"
              hint="Categories group the menu, e.g. Starters, Mains, Desserts."
            />
          )}

          {categories.map((category) => (
            <Card key={category.id} className="flex flex-wrap items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{category.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {category._count?.foods ?? 0} dish
                  {(category._count?.foods ?? 0) === 1 ? "" : "es"}
                  {!category.isActive && " · hidden from customers"}
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                order {category.sortOrder}
              </span>

              <div className="flex gap-2">
                {can("category:update") && (
                  <Button variant="secondary" onClick={() => setCategoryForm(category)}>
                    Edit
                  </Button>
                )}
                {can("category:delete") && (
                  <Button variant="ghost" onClick={() => setConfirmDelete(category)}>
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
            {/* Controlled, so a percentage discount re-prices the moment the
                price changes rather than on the next save. */}
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
                {/* Controlled, so a category created from the button beside it
                    can be selected the instant it exists. */}
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
                    className="shrink-0 rounded-lg border border-slate-300 px-3 text-lg font-semibold text-slate-600 transition hover:border-orange-500 hover:text-orange-600"
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
              <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  name="isVegetarian"
                  value="true"
                  defaultChecked={editingDish?.isVegetarian ?? false}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700">Vegetarian</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <input
                  type="checkbox"
                  name="isFeatured"
                  value="true"
                  defaultChecked={editingDish?.isFeatured ?? false}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-slate-700">
                  Chef's recommendation
                </span>
              </label>
            </div>
          </div>

          {/* ------------------------------------------------------ offer ---- */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-900">
              Offer
            </legend>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={offerEnabled}
                onChange={(event) => setOfferEnabled(event.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-slate-700">
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

                {/* The calculated offer price. Never an input — it is derived
                    from the price and the discount, and the server derives it
                    again on save from the same rule. */}
                {previewProblem ? (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {previewProblem}
                  </p>
                ) : (
                  previewPrice !== null && (
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-emerald-50 px-4 py-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                          Offer price
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-baseline gap-2">
                          <span className="text-xl font-bold text-emerald-800">
                            {formatMoney(previewPrice)}
                          </span>
                          <span className="text-sm text-emerald-700/70 line-through">
                            {formatMoney(price)}
                          </span>
                        </p>
                      </div>

                      <p className="text-xs font-medium text-emerald-700">
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

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={closeDishForm}>
            Cancel
          </Button>
          <button
            type="submit"
            form="dish-form"
            disabled={saveDish.isPending}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:bg-orange-300"
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

          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              name="isActive"
              value="true"
              defaultChecked={editingCategory?.isActive ?? true}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Visible to customers
            </span>
          </label>

          {saveCategory.isError && (
            <ErrorBox message={getErrorMessage(saveCategory.error)} />
          )}
        </form>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={() => setCategoryForm(null)}>
            Cancel
          </Button>
          <button
            type="submit"
            form="category-form"
            disabled={saveCategory.isPending}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:bg-orange-300"
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
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">
            {confirmDelete && "name" in confirmDelete ? confirmDelete.name : ""}
          </strong>{" "}
          will stop appearing for customers.
        </p>

        {/* Explains the soft delete, so nobody fears losing their reports. */}
        <p className="mt-2 text-sm text-slate-500">
          Past orders keep it, so your sales history and receipts stay accurate.
        </p>

        {/* The server refuses this, so the reason is stated before the attempt
            rather than surfaced as an error afterwards. */}
        {confirmDelete && !("price" in confirmDelete) && (
          <p className="mt-2 text-sm text-slate-500">
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

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
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
