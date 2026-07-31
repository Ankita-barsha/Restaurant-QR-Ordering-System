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
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import ImagePicker from "../../components/ImagePicker";
import Modal from "../../components/Modal";
import { Button, Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useAuth } from "../../context/auth";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { imageUrl } from "../../lib/format";
import { getSocket, SOCKET_EVENTS } from "../../lib/socket";
import type { ApiResponse, Review, SiteContent } from "../../types/api";

type Tab = "page" | "reviews";

const inputClass =
  "w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20";

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
    <span className="text-sm font-medium text-ivory-dim">{label}</span>

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

    {hint && <span className="text-xs text-ivory-faint">{hint}</span>}
  </label>
);

const StarRow = ({ rating }: { rating: number }) => (
  <span aria-label={`${rating} out of 5`} className="text-sm text-gold">
    {"★".repeat(rating)}
    <span className="text-ivory-faint opacity-40">{"★".repeat(5 - rating)}</span>
  </span>
);

const AdminContent = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("page");
  const [saved, setSaved] = useState(false);

  const [reviewForm, setReviewForm] = useState<Review | "new" | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Review | null>(null);

  /** Pending customer reviews waiting for moderation — shown as a live alert. */
  const [pendingAlerts, setPendingAlerts] = useState<Review[]>([]);
  const alertAudioRef = useRef<HTMLAudioElement | null>(null);

  const contentQuery = useQuery({
    queryKey: contentKey,
    queryFn: async () => unwrap(await api.get<ApiResponse<SiteContent>>("/content")),
    refetchInterval: 10_000,
  });

  const reviewsQuery = useQuery({
    queryKey: [...reviewsKey, "admin"],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<Review[]>>(
          "/content/reviews?includeHidden=true&limit=100"
        )
      ),
    refetchInterval: 3_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: contentKey });
    void queryClient.invalidateQueries({ queryKey: reviewsKey });
  };

  useEffect(() => {
    const socket = getSocket();

    const handleReviewChanged = (review: Review) => {
      void queryClient.invalidateQueries({ queryKey: contentKey });
      void queryClient.invalidateQueries({ queryKey: reviewsKey });

      // A freshly submitted customer review arrives with isVisible=false.
      // Show a live alert and switch to the Reviews tab automatically.
      if (review?.id && review.isVisible === false) {
        setTab("reviews");
        setPendingAlerts((prev) => {
          // Avoid duplicate alerts for the same review.
          if (prev.some((r) => r.id === review.id)) return prev;
          return [review, ...prev];
        });

        // Play a soft chime if the audio element is ready.
        if (alertAudioRef.current) {
          alertAudioRef.current.currentTime = 0;
          void alertAudioRef.current.play().catch(() => {
            /* user hasn't interacted yet — silent fail is fine */
          });
        }
      }
    };

    socket.on(SOCKET_EVENTS.REVIEW_CHANGED, handleReviewChanged);

    return () => {
      socket.off(SOCKET_EVENTS.REVIEW_CHANGED, handleReviewChanged);
    };
  }, [queryClient]);

  const saveContent = useMutation({
    mutationFn: async (payload: Record<string, string>) =>
      api.patch("/content", payload),
    onSuccess: () => {
      setSaved(true);
      invalidate();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const saveReview = useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: FormData }) => {
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

    for (const [key, value] of [...form.entries()]) {
      if (typeof value === "string" && value.trim() === "") form.delete(key);
    }

    form.set("isVisible", form.get("isVisible") === "true" ? "true" : "false");

    if (imageFile) form.set("image", imageFile);

    saveReview.mutate({ id: editingReview?.id, form });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Welcome Page Editor</h1>
          <p className="mt-0.5 text-sm text-ivory-dim">
            Copy and reviews, editable without touching the code. Changes are live immediately.
          </p>
        </div>

        {tab === "reviews" && can("review:create") && (
          <Button onClick={() => setReviewForm("new")} className="font-bold uppercase tracking-wider text-xs">
            + Add review
          </Button>
        )}
      </div>

      <div className="flex gap-1 rounded-xl bg-graphite border border-smoke p-1">
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
                ? "bg-gold text-obsidian shadow-sm font-bold"
                : "text-ivory-dim hover:text-ivory"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Silent chime element — src is a tiny base64 data-URI so there is
           no network request and no 404 in environments without assets. */}
      <audio
        ref={alertAudioRef}
        src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
        preload="auto"
        style={{ display: "none" }}
      />

      {saved && (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3.5 text-sm font-semibold text-emerald-400">
          Saved. The welcome page is already showing it.
        </div>
      )}

      {/* ---- Live incoming-review alerts ---- */}
      {pendingAlerts.length > 0 && (
        <div className="space-y-2">
          {pendingAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 animate-rise"
            >
              <span className="mt-0.5 text-xl">⭐</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-300">
                  New customer review — awaiting approval
                </p>
                <p className="mt-0.5 text-sm text-amber-200/80">
                  <span className="font-semibold">{alert.customerName}</span>
                  {" · "}
                  {"★".repeat(alert.rating)}{"☆".repeat(5 - alert.rating)}
                </p>
                {alert.comment && (
                  <p className="mt-1 text-xs text-amber-200/60 italic line-clamp-2">
                    "{alert.comment}"
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    // Find the full review in the list and open the editor.
                    const full = reviews.find((r) => r.id === alert.id);
                    if (full) setReviewForm(full);
                    setPendingAlerts((prev) => prev.filter((r) => r.id !== alert.id));
                  }}
                  className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition"
                >
                  Review
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAlerts((prev) => prev.filter((r) => r.id !== alert.id))
                  }
                  className="rounded-lg px-2 py-1.5 text-xs text-amber-400/60 hover:text-amber-300 transition"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- Page content ---------------- */}
      {tab === "page" && (
        <form onSubmit={submitContent} className="grid gap-4">
          {saveContent.isError && (
            <ErrorBox message={getErrorMessage(saveContent.error)} />
          )}

          <Card className="bg-charcoal">
            <h2 className="font-bold text-ivory text-base font-display">Welcome / hero</h2>
            <p className="mt-1 text-xs text-ivory-dim">
              The first screen a guest sees. Leave the title blank to use the
              restaurant name from Settings.
            </p>

            <div className="mt-3.5 grid gap-3.5">
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

          <Card className="bg-charcoal">
            <h2 className="font-bold text-ivory text-base font-display">Banner</h2>
            <p className="mt-1 text-xs text-ivory-dim">
              A single promotional line beneath the hero. Leave it blank and the
              strip disappears entirely.
            </p>

            <div className="mt-3.5">
              <Field
                label="Banner text"
                name="bannerText"
                defaultValue={content.bannerText}
                placeholder="Chef's tasting menu — Thursday to Sunday, from seven."
              />
            </div>
          </Card>

          <Card className="bg-charcoal">
            <h2 className="font-bold text-ivory text-base font-display">Featured section</h2>
            <p className="mt-1 text-xs text-ivory-dim">
              The wording around the chef's recommendations. Which dishes appear
              is set on the Menu screen with the ★ Feature button.
            </p>

            <div className="mt-3.5 grid gap-3.5">
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

          <Card className="bg-charcoal">
            <h2 className="font-bold text-ivory text-base font-display">
              About / restaurant description
            </h2>

            <div className="mt-3.5 grid gap-3.5">
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

          <Card className="bg-charcoal">
            <h2 className="font-bold text-ivory text-base font-display">Footer</h2>

            <div className="mt-3.5">
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
              className="justify-self-start font-bold uppercase tracking-wider"
            >
              {saveContent.isPending ? "Saving…" : "Save content"}
            </Button>
          )}
        </form>
      )}

      {/* ---------------- Reviews ---------------- */}
      {tab === "reviews" && (
        <div className="grid gap-3">
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
                className={`flex flex-wrap items-start gap-3 p-4 bg-charcoal border border-smoke ${
                  review.isVisible ? "" : "opacity-60"
                }`}
              >
                {portrait ? (
                  <img
                    src={portrait}
                    alt=""
                    className={`h-12 w-12 shrink-0 rounded-full object-cover border border-smoke ${
                      review.isVisible ? "" : "grayscale"
                    }`}
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-graphite border border-smoke text-sm font-bold text-gold">
                    {review.customerName.slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ivory text-base">
                      {review.customerName}
                    </p>
                    <StarRow rating={review.rating} />
                    {!review.isVisible && (
                      <span className="rounded-full bg-graphite border border-smoke px-2.5 py-0.5 text-[10px] font-bold uppercase text-ivory-faint">
                        hidden
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-ivory-dim">{review.comment}</p>

                  <p className="mt-1 text-xs text-ivory-faint">
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
                        className="font-bold text-xs"
                      >
                        {review.isVisible ? "Hide" : "Publish"}
                      </Button>

                      <Button
                        variant="secondary"
                        onClick={() => {
                          setReviewForm(review);
                          setImageFile(null);
                        }}
                        className="font-bold text-xs"
                      >
                        Edit
                      </Button>
                    </>
                  )}

                  {can("review:delete") && (
                    <Button variant="ghost" onClick={() => setConfirmDelete(review)} className="font-bold text-xs">
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
            <span className="text-sm font-medium text-ivory-dim">Customer name</span>
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
              <span className="text-sm font-medium text-ivory-dim">Rating</span>
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
              <span className="text-sm font-medium text-ivory-dim">
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
            <span className="text-sm font-medium text-ivory-dim">Review</span>
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
            <span className="text-sm font-medium text-ivory-dim">Display order</span>
            <input
              name="sortOrder"
              inputMode="numeric"
              defaultValue={editingReview?.sortOrder ?? 0}
              className={inputClass}
            />
            <span className="text-xs text-ivory-faint">
              Lower numbers appear first on the welcome page.
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-xl bg-graphite border border-smoke px-3 py-2.5">
            <input
              type="checkbox"
              name="isVisible"
              value="true"
              defaultChecked={editingReview?.isVisible ?? true}
              className="h-4 w-4 accent-gold"
            />
            <span className="text-sm font-medium text-ivory">
              Visible on the welcome page
            </span>
          </label>

          {saveReview.isError && <ErrorBox message={getErrorMessage(saveReview.error)} />}
        </form>

        <div className="mt-5 flex justify-end gap-2 border-t border-smoke pt-4">
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
            className="rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-obsidian shadow-sm transition hover:bg-gold-light disabled:opacity-50"
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
        <p className="text-sm text-ivory-dim">
          <strong className="text-ivory font-bold">{confirmDelete?.customerName}</strong>'s
          review will be removed permanently.
        </p>

        <p className="mt-2 text-sm text-ivory-faint">
          If you only want it off the site for now, hide it instead — a hidden
          review can be published again at any time.
        </p>

        {removeReview.isError && (
          <div className="mt-3">
            <ErrorBox message={getErrorMessage(removeReview.error)} />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2 border-t border-smoke pt-4">
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
