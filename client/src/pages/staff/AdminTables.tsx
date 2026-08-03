/**
 * Tables and QR codes.
 *
 * Each table shows its printable QR and its scan URL. Rotating a code
 * permanently invalidates the printed sticker, which is the response to a
 * leaked or photographed QR — so it asks for confirmation first.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button, Card, ErrorBox, Spinner } from "../../components/ui";
import { config } from "../../config/env";
import { useAuth } from "../../context/auth";
import { queryKeys } from "../../hooks/useLiveOrders";
import defaultLogo from "../../assets/image/logo.png";
import { api, getAccessToken, getErrorMessage, unwrap } from "../../lib/api";
import { imageUrl } from "../../lib/format";
import { buildQrPoster, downloadBlob } from "../../lib/qrPoster";
import type { ApiResponse, PublicSettings, Table, TableStatus } from "../../types/api";

const STATUS_STYLES: Record<TableStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  OCCUPIED: "bg-orange-100 text-orange-700",
  RESERVED: "bg-blue-100 text-blue-700",
  INACTIVE: "bg-slate-200 text-white-600",
};

const AdminTables = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [newNumber, setNewNumber] = useState("");
  const [newCapacity, setNewCapacity] = useState("4");

  const [qrBlobs, setQrBlobs] = useState<Record<string, string>>({});
  const [posterBusy, setPosterBusy] = useState<string | null>(null);
  const [posterError, setPosterError] = useState<string | null>(null);

  const tablesQuery = useQuery({
    queryKey: queryKeys.tables,
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<Table[]>>("/tables?includeInactive=true&limit=100")),
  });

  // The poster prints the restaurant's own name, so it comes from settings
  // rather than being hardcoded per deployment.
  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
  };

  const createTable = useMutation({
    mutationFn: async ({ tableNumber, capacity }: { tableNumber: string; capacity: number }) =>
      api.post("/tables", { tableNumber, capacity }),
    onSuccess: () => {
      setNewNumber("");
      setNewCapacity("4");
      invalidate();
    },
  });

  const tables = tablesQuery.data;

  useEffect(() => {
    if (!tables) return;

    let cancelled = false;
    const created: string[] = [];

    const load = async () => {
      const entries = await Promise.all(
        tables.map(async (table) => {
          const response = await fetch(
            `${config.apiUrl}/api/tables/${table.id}/qr.png`,
            { headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` } }
          );

          if (!response.ok) return null;

          const url = URL.createObjectURL(await response.blob());
          created.push(url);

          return [table.id, url] as const;
        })
      );

      if (cancelled) return;

      setQrBlobs(Object.fromEntries(entries.filter(Boolean) as [string, string][]));
    };

    void load();

    // Object URLs hold the blob in memory until revoked; without this every
    // refetch would leak one image per table.
    return () => {
      cancelled = true;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [tables]);

  /**
   * Frames the plain QR into the branded card and saves it.
   *
   * Composed on demand instead of at fetch time so the grid still paints its
   * previews immediately, and so a failure here costs the download only.
   */
  const downloadPoster = async (table: Table, qrSrc: string) => {
    setPosterBusy(table.id);
    setPosterError(null);

    const logoSrc = settingsQuery.data?.logoUrl
      ? imageUrl(settingsQuery.data.logoUrl, config.apiUrl)
      : defaultLogo;

    try {
      const poster = await buildQrPoster({
        qrSrc,
        restaurantName: settingsQuery.data?.name ?? "Bite me Bistro",
        tableNumber: table.tableNumber,
        logoSrc,
      });

      downloadBlob(poster, `qr-${table.tableNumber}.png`);
    } catch (error) {
      setPosterError(getErrorMessage(error));
    } finally {
      setPosterBusy(null);
    }
  };

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
      <h1 className="text-xl font-bold text-white-900">Tables &amp; QR codes</h1>

      {can("table:create") && (
        <Card className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newNumber) {
                createTable.mutate({
                  tableNumber: newNumber,
                  capacity: Number(newCapacity) || 4,
                });
              }
            }}
            className="flex flex-wrap items-center gap-3 sm:flex-nowrap"
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="table-number-input" className="mb-1 block text-xs font-semibold text-white-600">
                Table Number
              </label>
              <input
                id="table-number-input"
                value={newNumber}
                onChange={(event) => setNewNumber(event.target.value)}
                placeholder="e.g. T-09"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="w-32">
              <label htmlFor="table-capacity-input" className="mb-1 block text-xs font-semibold text-white-600">
                Seats (Capacity)
              </label>
              <input
                id="table-capacity-input"
                type="number"
                min={1}
                max={50}
                value={newCapacity}
                onChange={(event) => setNewCapacity(event.target.value)}
                placeholder="4"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-5 sm:mt-0">
              <Button type="submit" disabled={!newNumber || createTable.isPending}>
                {createTable.isPending ? "Creating…" : "Add table"}
              </Button>
            </div>
          </form>

          {createTable.isError && (
            <div className="mt-3">
              <ErrorBox message={getErrorMessage(createTable.error)} />
            </div>
          )}
        </Card>
      )}

      {posterError && (
        <div className="mt-4">
          <ErrorBox message={posterError} />
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tables?.map((table) => {
          const qr = qrBlobs[table.id] ?? null;

          return (
            <Card key={table.id}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-white-900">
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

                <p className="mt-0.5 text-xs text-white-500">Seats {table.capacity}</p>

                {qr && (
                  <a href={qr} target="_blank" rel="noreferrer" className="mt-3 block">
                    <img
                      src={qr}
                      alt={`QR code for table ${table.tableNumber}`}
                      className="mx-auto h-40 w-40 rounded-lg border border-slate-200"
                    />
                  </a>
                )}

                <p className="mt-2 truncate text-center text-[11px] text-white-400">
                  /t/{table.qrToken}
                </p>

                <div className="mt-3">
                  {qr && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      disabled={posterBusy === table.id}
                      onClick={() => void downloadPoster(table, qr)}
                    >
                      {posterBusy === table.id ? "Preparing…" : "Download QR Code"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-white-400">
        Scan URLs point at {scanUrlHint()}. Set VITE_API_URL and the server's
        QR_BASE_URL to your public domain before printing codes for real use.
      </p>
    </div>
  );
};

/** Kept out of the JSX so the note above stays readable. */
const scanUrlHint = (): string => window.location.origin;

export default AdminTables;
