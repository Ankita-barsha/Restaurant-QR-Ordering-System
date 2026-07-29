/**
 * Content management — the welcome page, without touching code.
 *
 * Two tabs, because they are two different jobs done at different times: the
 * page's own copy, which changes rarely, and the customer reviews, which are
 * added one at a time.
 *
 * Every copy field is optional and every placeholder shows the built-in text
 * that will be used if it is left blank. That is what makes the form safe to
 * open and close without a plan: nothing is lost by editing nothing, and
 * clearing a box restores the original wording rather than leaving a gap.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import ImagePicker from "../../components/ImagePicker";
import Modal from "../../components/Modal";
import { Button, Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useAuth } from "../../context/auth";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { imageUrl } from "../../lib/format";
import type { ApiResponse, Review, SiteContent } from "../../types/api";

type Tab = "page" | "reviews";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

/** Query keys, so an edit anywhere refreshes the public page's copy too. */
const contentKey = ["content"] as const;
const reviewsKey = ["content", "reviews"] as const;

const Field = ({
  label,
  name,
  defaultValue,
  placeholder,
  rows,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-sm font-medium text-slate-700">{label}</span>

    {rows ? (
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={inputClass}
      />
    ) : (
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={inputClass}
      />
    )}

    {hint && <span className="text-xs text-slate-400">{hint}</span>}
  </label>
);

/** Read-only star row, matching the marks the welcome page renders. */
const StarRow = ({ rating }: { rating: number }) => (
  <span aria-label={`${rating} out of 5`} className="text-sm text-amber-500">
    {"★".repeat(rating)}
    <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
  </span>
);

const AdminContent = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("page");
  const [saved, setSaved] = useState(false);

  // null = closed, "new" = create, otherwise the review being edited.
  const [reviewForm, setReviewForm] = useState<Review | "new" | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Review | null>(null);

  const contentQuery = useQuery({
    queryKey: contentKey,
    queryFn: async () => unwrap(await api.get<ApiResponse<SiteContent>>("/content")),
  });

  const reviewsQuery = useQuery({
    queryKey: [...reviewsKey, "admin"],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<Review[]>>(
          "/content/reviews?includeHidden=true&limit=100"
        )
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: contentKey });
  };

  const saveContent = useMutation({
    mutationFn: async (payload: Record<string, string>) =>
      api.patch("/content", payload),
    onSuccess: () => {
      setSaved(true);
      invalidate();
      // Clears itself so it cannot be mistaken for the state of a later,
      // unsaved edit.
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const saveReview = useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: FormData }) => {
      // Content-Type is undefined so the browser supplies it WITH the
      // multipart boundary — setting it by hand produces a body multer
      // cannot parse.
      const headers = { "Content-Type": undefined };

      return id
        ? api.patch(`/content/reviews/${id}`, form, { headers })
        : api.post("/content/reviews", form, { headers });
    },
    onSuccess: () => {
      setReviewForm(null);
      setImageFile(null);
      invalidate();
    },
  });

  const toggleVisibility = useMutation({
    mutationFn: async ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      api.patch(`/content/reviews/${id}/visibility`, { isVisible }),
    onSuccess: invalidate,
  });

  const removeReview = useMutation({
    mutationFn: async (review: Review) =>
      api.delete(`/content/reviews/${review.id}`),
    onSuccess: () => {
      setConfirmDelete(null);
      invalidate();
    },
  });

  if (contentQuery.isLoading) return <Spinner label="Loading content" />;

  if (contentQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(contentQuery.error)}
        onRetry={() => void contentQuery.refetch()}
      />
    );
  }

  const content = contentQuery.data;
  if (!content) return null;

  const reviews = reviewsQuery.data ?? [];
  const editingReview = reviewForm !== "new" ? reviewForm : null;
  const visibleCount = reviews.filter((review) => review.isVisible).length;

  /**
   * Every box is submitted, including the empty ones.
   *
   * Unlike the settings form, blanks are NOT dropped here: an empty string is
   * how an editor says "clear this and go back to the built-in wording", and
   * omitting the field would silently leave the old text in place.
   */
  const submitContent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};

    for (const [key, value] of form.entries()) {
      if (typeof value === "string") payload[key] = value.trim();
    }

    saveContent.mutate(payload);
  };

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    // Blank optional fields are dropped rather than sent as "", which the
    // server's optional schemas reject.
    for (const [key, value] of [...form.entries()]) {
      if (typeof value === "string" && value.trim() === "") form.delete(key);
    }

    // Absent when unchecked, so it is set explicitly — otherwise unticking
    // "visible" would never save.
    form.set("isVisible", form.get("isVisible") === "true" ? "true" : "false");

    if (imageFile) form.set("image", imageFile);

    saveReview.mutate({ id: editingReview?.id, form });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Welcome page</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Copy and reviews, editable without touching the code. Changes are live
            immediately.
          </p>
        </div>

        {tab === "reviews" && can("review:create") && (
          <Button onClick={() => setReviewForm("new")}>+ Add review</Button>
        )}
      </div>

      <div className="mt-4 flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {(
          [
            { value: "page", label: "Page content" },
            { value: "reviews", label: `Reviews (${visibleCount}/${reviews.length})` },
          ] as { value: Tab; label: string }[]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === option.value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {saved && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
          Saved. The welcome page is already showing it.
        </div>
      )}

      {/* ---------------- Page content ---------------- */}
      {tab === "page" && (
        <form onSubmit={submitContent} className="mt-4 grid gap-4">
          {saveContent.isError && (
            <ErrorBox message={getErrorMessage(saveContent.error)} />
          )}

          <Card>
            <h2 className="font-semibold text-slate-900">Welcome / hero</h2>
            <p className="mt-1 text-xs text-slate-500">
              The first screen a guest sees. Leave the title blank to use the
              restaurant name from Settings.
            </p>

            <div className="mt-3 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Small line above the title"
                  name="heroEyebrow"
                  defaultValue={content.heroEyebrow}
                  placeholder="Est. 2019 · Fine Dining"
                />
                <Field
                  label="Title"
                  name="heroTitle"
                  defaultValue={content.heroTitle}
                  placeholder="Your restaurant name"
                />
              </div>

              <Field
                label="Introduction"
                name="heroLede"
                rows={3}
                defaultValue={content.heroLede}
                placeholder="A seasonal menu built around fire, patience and produce picked the same morning."
                hint="Falls back to the tagline in Settings when blank."
              />
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Banner</h2>
            <p className="mt-1 text-xs text-slate-500">
              A single promotional line beneath the hero. Leave it blank and the
              strip disappears entirely.
            </p>

            <div className="mt-3">
              <Field
                label="Banner text"
                name="bannerText"
                defaultValue={content.bannerText}
                placeholder="Chef's tasting menu — Thursday to Sunday, from seven."
              />
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Featured section</h2>
            <p className="mt-1 text-xs text-slate-500">
              The wording around the chef's recommendations. Which dishes appear
              is set on the Menu screen with the ★ Feature button.
            </p>

            <div className="mt-3 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Small line above"
                  name="featuredEyebrow"
                  defaultValue={content.featuredEyebrow}
                  placeholder="Chef's recommendation"
                />
                <Field
                  label="Heading"
                  name="featuredTitle"
                  defaultValue={content.featuredTitle}
                  placeholder="What we would order"
                />
              </div>

              <Field
                label="Introduction"
                name="featuredLede"
                rows={2}
                defaultValue={content.featuredLede}
                placeholder="The plates the kitchen is proudest of tonight."
              />
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">
              About / restaurant description
            </h2>

            <div className="mt-3 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Small line above"
                  name="aboutEyebrow"
                  defaultValue={content.aboutEyebrow}
                  placeholder="The house"
                />
                <Field
                  label="Heading"
                  name="aboutTitle"
                  defaultValue={content.aboutTitle}
                  placeholder="A room built around one table"
                />
              </div>

              <Field
                label="Description"
                name="aboutBody"
                rows={6}
                defaultValue={content.aboutBody}
                placeholder="Tell guests who you are, how you cook, and what to expect."
                hint="Leave a blank line between paragraphs."
              />
            </div>
          </Card>

          <Card>
            <h2 className="font-semibold text-slate-900">Footer</h2>

            <div className="mt-3">
              <Field
                label="Closing note"
                name="footerNote"
                rows={2}
                defaultValue={content.footerNote}
                placeholder="Scan, order, dine."
              />
            </div>
          </Card>

          {can("content:update") && (
            <Button
              type="submit"
              disabled={saveContent.isPending}
              className="justify-self-start"
            >
              {saveContent.isPending ? "Saving…" : "Save content"}
            </Button>
          )}
        </form>
      )}

      {/* ---------------- Reviews ---------------- */}
      {tab === "reviews" && (
        <div className="mt-4 grid gap-3">
          {(toggleVisibility.isError || removeReview.isError) && (
            <ErrorBox
              message={getErrorMessage(toggleVisibility.error ?? removeReview.error)}
            />
          )}

          {reviewsQuery.isLoading && <Spinner label="Loading reviews" />}

          {!reviewsQuery.isLoading && reviews.length === 0 && (
            <EmptyState
              title="No reviews yet"
              hint="Add what guests have told you. Visible reviews appear on the welcome page immediately."
              icon={<span className="text-4xl">★</span>}
            />
          )}

          {reviews.map((review) => {
            const portrait = imageUrl(review.imageUrl, config.apiUrl);

            return (
              <Card
                key={review.id}
                className={`flex flex-wrap items-start gap-3 p-3.5 sm:flex-nowrap sm:gap-4 sm:p-4 ${
                  review.isVisible ? "" : "bg-slate-50"
                }`}
              >
                {portrait ? (
                  <img
                    src={portrait}
                    alt=""
                    className={`h-12 w-12 shrink-0 rounded-full object-cover ${
                      review.isVisible ? "" : "grayscale"
                    }`}
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
                    {review.customerName.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {review.customerName}
                    </p>
                    <StarRow rating={review.rating} />
                    {!review.isVisible && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        hidden
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-slate-600">{review.comment}</p>

                  <p className="mt-1 text-xs text-slate-400">
                    order {review.sortOrder}
                    {review.visitedOn
                      ? ` · dined ${new Date(review.visitedOn).toLocaleDateString(
                          "en-IN",
                          { dateStyle: "medium" }
                        )}`
                      : ""}
                  </p>
                </div>

                <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                  {can("review:update") && (
                    <>
                      <Button
                        variant={review.isVisible ? "secondary" : "primary"}
                        disabled={toggleVisibility.isPending}
                        onClick={() =>
                          toggleVisibility.mutate({
                            id: review.id,
                            isVisible: !review.isVisible,
                          })
                        }
                      >
                        {review.isVisible ? "Hide" : "Publish"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => {
                          setReviewForm(review);
                          setImageFile(null);
                        }}
                      >
                        Edit
                      </Button>
                    </>
                  )}

                  {can("review:delete") && (
                    <Button variant="ghost" onClick={() => setConfirmDelete(review)}>
                      Delete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------------- Review form ---------------- */}
      <Modal
        open={reviewForm !== null}
        onClose={() => {
          setReviewForm(null);
          setImageFile(null);
        }}
        title={editingReview ? "Edit review" : "Add a review"}
        description="Visible reviews appear on the welcome page straight away."
      >
        <form id="review-form" onSubmit={submitReview} className="grid gap-4">
          <ImagePicker
            label="Photo (optional)"
            currentUrl={imageUrl(editingReview?.imageUrl ?? null, config.apiUrl)}
            onChange={setImageFile}
          />

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Customer name</span>
            <input
              name="customerName"
              required
              defaultValue={editingReview?.customerName}
              placeholder="Ananya Sen"
              className={inputClass}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">Rating</span>
              <select
                name="rating"
                required
                defaultValue={editingReview?.rating ?? 5}
                className={inputClass}
              >
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {"★".repeat(value)} ({value})
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-slate-700">
                Date (optional)
              </span>
              <input
                name="visitedOn"
                type="date"
                defaultValue={editingReview?.visitedOn?.slice(0, 10) ?? ""}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Review</span>
            <textarea
              name="comment"
              required
              rows={4}
              defaultValue={editingReview?.comment}
              placeholder="What did they say about the food or the service?"
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">Display order</span>
            <input
              name="sortOrder"
              inputMode="numeric"
              defaultValue={editingReview?.sortOrder ?? 0}
              className={inputClass}
            />
            <span className="text-xs text-slate-400">
              Lower numbers appear first on the welcome page.
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              name="isVisible"
              value="true"
              defaultChecked={editingReview?.isVisible ?? true}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-slate-700">
              Visible on the welcome page
            </span>
          </label>

          {saveReview.isError && <ErrorBox message={getErrorMessage(saveReview.error)} />}
        </form>

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setReviewForm(null);
              setImageFile(null);
            }}
          >
            Cancel
          </Button>
          <button
            type="submit"
            form="review-form"
            disabled={saveReview.isPending}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:bg-orange-300"
          >
            {saveReview.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      {/* ---------------- Delete confirmation ---------------- */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this review?"
      >
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{confirmDelete?.customerName}</strong>'s
          review will be removed permanently.
        </p>

        {/* Steers towards the reversible option, which is nearly always what
            the admin actually wants. */}
        <p className="mt-2 text-sm text-slate-500">
          If you only want it off the site for now, hide it instead — a hidden
          review can be published again at any time.
        </p>

        {removeReview.isError && (
          <div className="mt-3">
            <ErrorBox message={getErrorMessage(removeReview.error)} />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            disabled={removeReview.isPending}
            onClick={() => confirmDelete && removeReview.mutate(confirmDelete)}
          >
            {removeReview.isPending ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default AdminContent;
