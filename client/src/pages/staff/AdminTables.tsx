/**
 * Tables and QR codes.
 *
 * Each table shows its printable QR and its scan URL. Rotating a code
 * permanently invalidates the printed sticker, which is the response to a
 * leaked or photographed QR — so it asks for confirmation first.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useAuth } from "../../context/AuthContext";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { imageUrl } from "../../lib/format";
import type { ApiResponse, Table, TableStatus } from "../../types/api";

const STATUS_STYLES: Record<TableStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  OCCUPIED: "bg-orange-100 text-orange-700",
  RESERVED: "bg-blue-100 text-blue-700",
  INACTIVE: "bg-slate-200 text-slate-600",
};

const AdminTables = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [newNumber, setNewNumber] = useState("");
  const [confirmRotate, setConfirmRotate] = useState<string | null>(null);

  const tablesQuery = useQuery({
    queryKey: queryKeys.tables,
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Table[]>>("/tables?includeInactive=true&limit=100")),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
  };

  const createTable = useMutation({
    mutationFn: async (tableNumber: string) => api.post("/tables", { tableNumber }),
    onSuccess: () => {
      setNewNumber("");
      invalidate();
    },
  });

  const rotateQr = useMutation({
    mutationFn: async (id: string) => api.post(`/tables/${id}/qr/rotate`),
    onSuccess: () => {
      setConfirmRotate(null);
      invalidate();
    },
  });

  if (tablesQuery.isLoading) return <Spinner label="Loading tables" />;

  if (tablesQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(tablesQuery.error)}
        onRetry={() => void tablesQuery.refetch()}
      />
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900">Tables &amp; QR codes</h1>

      {can("table:create") && (
        <Card className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newNumber) createTable.mutate(newNumber);
            }}
            className="flex gap-3"
          >
            <input
              value={newNumber}
              onChange={(event) => setNewNumber(event.target.value)}
              placeholder="Table number, e.g. T-09"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!newNumber || createTable.isPending}>
              {createTable.isPending ? "Creating…" : "Add table"}
            </Button>
          </form>

          {createTable.isError && (
            <div className="mt-3">
              <ErrorBox message={getErrorMessage(createTable.error)} />
            </div>
          )}
        </Card>
      )}

      {rotateQr.isError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(rotateQr.error)} />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tablesQuery.data?.map((table) => {
          const qr = imageUrl(table.qrImageUrl, config.apiUrl);

          return (
            <Card key={table.id}>
              <div className="flex items-center justify-between">
                <span className="text-lg font-black text-slate-900">
                  {table.tableNumber}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    STATUS_STYLES[table.status]
                  }`}
                >
                  {table.status}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-slate-500">Seats {table.capacity}</p>

              {qr && (
                <a href={qr} target="_blank" rel="noreferrer" className="mt-3 block">
                  <img
                    src={qr}
                    alt={`QR code for table ${table.tableNumber}`}
                    className="mx-auto h-40 w-40 rounded-lg border border-slate-200"
                  />
                </a>
              )}

              {/* The scan URL is shown so it can be verified against what a
                  phone opens, and copied into a print template. */}
              <p className="mt-2 truncate text-center text-[11px] text-slate-400">
                /t/{table.qrToken}
              </p>

              <div className="mt-3 flex gap-2">
                {qr && (
                  <a href={qr} download className="flex-1">
                    <Button variant="secondary" className="w-full">
                      Download
                    </Button>
                  </a>
                )}

                {can("qr:manage") && (
                  <Button
                    variant="danger"
                    className="flex-1"
                    onClick={() => setConfirmRotate(table.id)}
                    disabled={rotateQr.isPending}
                  >
                    Rotate
                  </Button>
                )}
              </div>

              {confirmRotate === table.id && (
                <div className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-800">
                  <p className="font-semibold">
                    This permanently invalidates the printed code.
                  </p>
                  <p className="mt-1">
                    Anyone scanning the old sticker will see “no longer valid”. You will
                    need to print and replace it.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="danger" onClick={() => rotateQr.mutate(table.id)}>
                      Rotate anyway
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmRotate(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Scan URLs point at {scanUrlHint()}. Set VITE_API_URL and the server's
        QR_BASE_URL to your public domain before printing codes for real use.
      </p>
    </div>
  );
};

/** Kept out of the JSX so the note above stays readable. */
const scanUrlHint = (): string => window.location.origin;

export default AdminTables;
