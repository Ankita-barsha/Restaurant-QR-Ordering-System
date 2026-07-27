/**
 * Menu management — dishes and categories.
 *
 * Everything the restaurant serves is editable here: add a new dish with a
 * photo when it arrives, change a price, mark something sold out mid-service,
 * or retire it. Nothing about the menu is hard-coded.
 *
 * Sold-out is a one-tap control on every row rather than buried in the edit
 * form, because it is the action used most during a busy service — and it
 * broadcasts over the socket, so diners' phones grey the dish out instantly.
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
import type { ApiResponse, Category, Food } from "../../types/api";

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

  const closeDishForm = () => {
    setDishForm(null);
    setImageFile(null);
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
      id ? api.patch(`/categories/${id}`, body) : api.post("/categories", body),
    onSuccess: () => {
      setCategoryForm(null);
      invalidate();
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.patch(`/foods/${id}/availability`, { isAvailable }),
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

    // Checkboxes are absent when unchecked, so both booleans are set
    // explicitly — otherwise unticking "vegetarian" would never save.
    form.set("isVegetarian", form.get("isVegetarian") === "true" ? "true" : "false");

    if (imageFile) form.set("image", imageFile);

    saveDish.mutate({ id: editingDish?.id, form });
  };

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
              <Button onClick={() => setDishForm("new")}>+ Add dish</Button>
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

      {(toggleAvailability.isError || removeItem.isError) && (
        <div className="mt-4">
          <ErrorBox
            message={getErrorMessage(toggleAvailability.error ?? removeItem.error)}
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
                className={`flex flex-wrap items-center gap-4 p-3 transition sm:flex-nowrap ${
                  food.isAvailable ? "" : "bg-slate-50"
                }`}
              >
                {image ? (
                  <img
                    src={image}
                    alt={food.name}
                    className={`h-20 w-20 shrink-0 rounded-xl object-cover ${
                      food.isAvailable ? "" : "grayscale"
                    }`}
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
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
                  </div>

                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {food.category.name}
                    {food.preparationMinutes ? ` · ${food.preparationMinutes} min` : ""}
                  </p>
                </div>

                <span className="text-base font-bold text-slate-900">
                  {formatMoney(food.price)}
                </span>

                <div className="flex w-full gap-2 sm:w-auto">
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

                  {can("food:update") && (
                    <Button variant="secondary" onClick={() => setDishForm(food)}>
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
            <Card key={category.id} className="flex flex-wrap items-center gap-4 p-4">
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
            <Field label="Price" hint="Up to 2 decimal places">
              <input
                name="price"
                required
                inputMode="decimal"
                defaultValue={editingDish?.price}
                placeholder="329.00"
                className={inputClass}
              />
            </Field>

            <Field label="Category">
              <select
                name="categoryId"
                required
                defaultValue={editingDish?.categoryId ?? ""}
                className={inputClass}
              >
                <option value="">Choose…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
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
          </div>

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
