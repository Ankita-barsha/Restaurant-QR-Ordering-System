/**
 * Menu management.
 *
 * The sold-out toggle is the control used most during service, so it sits on
 * every row rather than behind an edit form. Toggling it broadcasts over the
 * socket and greys the dish out on every diner's phone immediately.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, imageUrl } from "../../lib/format";
import type { ApiResponse, Category, Food } from "../../types/api";

const AdminMenu = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: async () => unwrap(await api.get<ApiResponse<Category[]>>("/categories")),
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
  };

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api.patch(`/foods/${id}/availability`, { isAvailable }),
    onSuccess: invalidate,
  });

  /**
   * Creation posts multipart/form-data because it may carry an image.
   * The Content-Type header is deleted so the browser sets it WITH the
   * multipart boundary — setting it manually produces a malformed body that
   * multer cannot parse.
   */
  const createFood = useMutation({
    mutationFn: async (form: FormData) =>
      api.post("/foods", form, { headers: { "Content-Type": undefined } }),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  if (foodsQuery.isLoading) return <Spinner label="Loading menu" />;

  if (foodsQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(foodsQuery.error)}
        onRetry={() => void foodsQuery.refetch()}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Menu</h1>

        {can("food:create") && (
          <Button onClick={() => setShowForm((previous) => !previous)}>
            {showForm ? "Close" : "Add dish"}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createFood.mutate(new FormData(event.currentTarget));
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <input
              name="name"
              required
              placeholder="Dish name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="price"
              required
              inputMode="decimal"
              placeholder="Price e.g. 249.00"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="categoryId"
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Choose a category…</option>
              {categoriesQuery.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              name="preparationMinutes"
              inputMode="numeric"
              placeholder="Prep minutes"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <textarea
              name="description"
              placeholder="Description"
              rows={2}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              {/* value="true" matches the server's booleanish schema, which
                  accepts the literal strings "true"/"false" only. */}
              <input type="checkbox" name="isVegetarian" value="true" /> Vegetarian
            </label>
            <input
              type="file"
              name="image"
              accept="image/*"
              className="text-sm text-slate-600"
            />

            {createFood.isError && (
              <div className="sm:col-span-2">
                <ErrorBox message={getErrorMessage(createFood.error)} />
              </div>
            )}

            <Button type="submit" disabled={createFood.isPending} className="sm:col-span-2">
              {createFood.isPending ? "Saving…" : "Create dish"}
            </Button>
          </form>
        </Card>
      )}

      {toggleAvailability.isError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(toggleAvailability.error)} />
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {foodsQuery.data?.map((food) => {
          const image = imageUrl(food.imageUrl, config.apiUrl);

          return (
            <div
              key={food.id}
              className={`flex items-center gap-4 rounded-2xl border p-3 ${
                food.isAvailable
                  ? "border-slate-200 bg-white"
                  : "border-slate-200 bg-slate-50 opacity-70"
              }`}
            >
              {image ? (
                <img
                  src={image}
                  alt={food.name}
                  className="h-16 w-16 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                  🍽️
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{food.name}</p>
                <p className="text-xs text-slate-500">
                  {food.category.name} · {food.isVegetarian ? "Veg" : "Non-veg"}
                </p>
              </div>

              <span className="font-bold text-slate-900">{formatMoney(food.price)}</span>

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
                  {food.isAvailable ? "Mark sold out" : "Back in stock"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminMenu;
