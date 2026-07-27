/**
 * The reservation book.
 *
 * Sorted soonest-first and defaulted to today, because the only question the
 * floor asks this screen is "who is arriving next".
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse, Table } from "../../types/api";

type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

interface Reservation {
  id: string;
  reference: string;
  name: string;
  phone: string;
  email: string | null;
  partySize: number;
  reservedAt: string;
  status: ReservationStatus;
  occasion: string | null;
  notes: string | null;
  table: { id: string; tableNumber: string; capacity: number } | null;
}

const STATUS_STYLES: Record<ReservationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-700",
  SEATED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

/** The next action, matching the server's state machine exactly. */
const NEXT_ACTIONS: Record<ReservationStatus, { next: ReservationStatus; label: string }[]> = {
  PENDING: [
    { next: "CONFIRMED", label: "Confirm" },
    { next: "CANCELLED", label: "Decline" },
  ],
  CONFIRMED: [
    { next: "SEATED", label: "Seat party" },
    { next: "NO_SHOW", label: "No show" },
    { next: "CANCELLED", label: "Cancel" },
  ],
  SEATED: [{ next: "COMPLETED", label: "Finish" }],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const FILTERS: { label: string; value: string }[] = [
  { label: "Today", value: "today" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Seated", value: "SEATED" },
  { label: "All", value: "all" },
];

const AdminReservations = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("today");
  const [assigning, setAssigning] = useState<string | null>(null);

  const reservationsQuery = useQuery({
    queryKey: ["reservations", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });

      if (filter === "today") params.set("today", "true");
      else if (filter !== "all") params.set("status", filter);

      return unwrap(
        await api.get<ApiResponse<Reservation[]>>(`/reservations?${params.toString()}`)
      );
    },
    refetchInterval: 60_000,
  });

  const tablesQuery = useQuery({
    queryKey: ["tables", "for-reservations"],
    queryFn: async () => unwrap(await api.get<ApiResponse<Table[]>>("/tables?limit=100")),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["tables"] });
  };

  const setStatus = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: ReservationStatus }) =>
      api.patch(`/reservations/${id}/status`, { status: next }),
    onSuccess: invalidate,
  });

  const assignTable = useMutation({
    mutationFn: async ({ id, tableId }: { id: string; tableId: string }) =>
      api.patch(`/reservations/${id}`, { tableId }),
    onSuccess: () => {
      setAssigning(null);
      invalidate();
    },
  });

  if (reservationsQuery.isLoading) return <Spinner label="Loading the book" />;

  if (reservationsQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(reservationsQuery.error)}
        onRetry={() => void reservationsQuery.refetch()}
      />
    );
  }

  const reservations = reservationsQuery.data ?? [];
  const covers = reservations
    .filter((r) => !["CANCELLED", "NO_SHOW"].includes(r.status))
    .reduce((sum, r) => sum + r.partySize, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reservations</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {reservations.length} booking{reservations.length === 1 ? "" : "s"} ·{" "}
            {covers} cover{covers === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === option.value
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(setStatus.isError || assignTable.isError) && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(setStatus.error ?? assignTable.error)} />
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing in the book"
            hint="Bookings made on the website appear here automatically."
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          {reservations.map((reservation) => {
            const when = new Date(reservation.reservedAt);
            const actions = NEXT_ACTIONS[reservation.status];

            return (
              <Card key={reservation.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Time first: it is what the floor scans for. */}
                  <div className="shrink-0 text-center">
                    <p className="text-lg font-black leading-none text-slate-900">
                      {when.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {when.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">
                      {reservation.name}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        party of {reservation.partySize}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {reservation.reference} · {reservation.phone}
                      {reservation.occasion && ` · ${reservation.occasion}`}
                    </p>
                  </div>

                  {reservation.table && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {reservation.table.tableNumber}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      STATUS_STYLES[reservation.status]
                    }`}
                  >
                    {reservation.status.replace("_", " ")}
                  </span>
                </div>

                {reservation.notes && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {reservation.notes}
                  </p>
                )}

                {can("reservation:update") && actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Seating needs a table, so that button assigns one first. */}
                    {reservation.status === "CONFIRMED" && !reservation.table && (
                      <Button
                        variant="secondary"
                        onClick={() => setAssigning(reservation.id)}
                      >
                        Assign table
                      </Button>
                    )}

                    {actions.map((action) => (
                      <Button
                        key={action.next}
                        variant={
                          action.next === "CANCELLED" || action.next === "NO_SHOW"
                            ? "ghost"
                            : "primary"
                        }
                        disabled={
                          setStatus.isPending ||
                          (action.next === "SEATED" && !reservation.table)
                        }
                        onClick={() =>
                          setStatus.mutate({ id: reservation.id, next: action.next })
                        }
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}

                {assigning === reservation.id && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-700">
                      Choose a table seating {reservation.partySize} or more
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {tablesQuery.data
                        ?.filter((table) => table.capacity >= reservation.partySize)
                        .map((table) => (
                          <button
                            key={table.id}
                            type="button"
                            onClick={() =>
                              assignTable.mutate({
                                id: reservation.id,
                                tableId: table.id,
                              })
                            }
                            disabled={assignTable.isPending}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
                          >
                            {table.tableNumber}
                            <span className="ml-1 text-slate-400">
                              ({table.capacity})
                            </span>
                          </button>
                        ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setAssigning(null)}
                      className="mt-2 text-xs text-slate-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminReservations;
