/**
 * The reservation book.
 *
 * Sorted soonest-first and defaulted to today, because the only question the
 * floor asks this screen is "who is arriving next".
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
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
  PENDING: "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold",
  CONFIRMED: "bg-blue-500/15 text-blue-400 border border-blue-500/30 font-semibold",
  SEATED: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold",
  COMPLETED: "bg-graphite text-ivory-dim border border-smoke font-semibold",
  CANCELLED: "bg-red-500/15 text-red-400 border border-red-500/30 font-semibold",
  NO_SHOW: "bg-ember/15 text-ember border border-ember/30 font-semibold",
};

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Reservation Book</h1>
          <p className="mt-0.5 text-sm text-ivory-dim">
            {reservations.length} booking{reservations.length === 1 ? "" : "s"} ·{" "}
            {covers} cover{covers === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
              filter === option.value
                ? "bg-gold text-obsidian shadow-sm"
                : "bg-graphite border border-smoke text-ivory-dim hover:border-gold/50 hover:text-ivory"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {(setStatus.isError || assignTable.isError) && (
        <div>
          <ErrorBox message={getErrorMessage(setStatus.error ?? assignTable.error)} />
        </div>
      )}

      {reservations.length === 0 ? (
        <div>
          <EmptyState
            title="Nothing in the book"
            hint="Bookings made on the website appear here automatically."
          />
        </div>
      ) : (
        <div className="grid gap-3">
          {reservations.map((reservation) => {
            const when = new Date(reservation.reservedAt);
            const actions = NEXT_ACTIONS[reservation.status];

            return (
              <Card key={reservation.id} className="p-4 bg-charcoal">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="shrink-0 text-center bg-graphite border border-smoke px-3 py-2 rounded-xl">
                    <p className="text-lg font-bold font-mono text-gold">
                      {when.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-ivory-dim">
                      {when.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ivory text-base">
                      {reservation.name}
                      <span className="ml-2 text-sm font-normal text-gold">
                        party of {reservation.partySize}
                      </span>
                    </p>
                    <p className="text-xs text-ivory-dim mt-0.5">
                      Ref #{reservation.reference} · {reservation.phone}
                      {reservation.occasion && ` · ${reservation.occasion}`}
                    </p>
                  </div>

                  {reservation.table && (
                    <span className="rounded-full bg-graphite border border-smoke px-3 py-1 text-xs font-bold text-ivory">
                      Table {reservation.table.tableNumber}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      STATUS_STYLES[reservation.status]
                    }`}
                  >
                    {reservation.status.replace("_", " ")}
                  </span>
                </div>

                {reservation.notes && (
                  <p className="mt-2.5 rounded-lg bg-gold/15 border border-gold/30 px-3 py-2 text-xs text-gold font-medium">
                    Guest Note: {reservation.notes}
                  </p>
                )}

                {can("reservation:update") && actions.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-2 pt-2 border-t border-smoke/40">
                    {reservation.status === "CONFIRMED" && !reservation.table && (
                      <Button
                        variant="secondary"
                        onClick={() => setAssigning(reservation.id)}
                        className="font-bold text-xs"
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
                        className="font-bold text-xs uppercase tracking-wider"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}

                {assigning === reservation.id && (
                  <div className="mt-3 rounded-xl bg-graphite border border-smoke p-3">
                    <p className="text-xs font-medium text-ivory-dim">
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
                            className="rounded-lg bg-charcoal px-3 py-1.5 text-xs font-bold text-ivory border border-smoke hover:border-gold"
                          >
                            Table {table.tableNumber}
                            <span className="ml-1 text-gold">
                              ({table.capacity} seats)
                            </span>
                          </button>
                        ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setAssigning(null)}
                      className="mt-2.5 text-xs text-ivory-faint hover:text-gold"
                    >
                      Cancel assignment
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
