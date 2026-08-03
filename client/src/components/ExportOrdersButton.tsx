/**
 * Downloads the order book as an Excel workbook.
 *
 * Renders NOTHING for a user without `order:export`. That is not the security
 * boundary — the server refuses the request regardless — but a button that
 * only ever produces "403 Forbidden" is worse than no button, and waiting
 * staff share these screens with managers all shift.
 *
 * The download goes through the shared axios instance rather than a bare
 * fetch, so it carries the access token and, more importantly, is retried
 * after a silent refresh when that token has expired mid-shift. A raw fetch
 * would hand the manager a 401 and no file.
 */

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useAuth } from "../context/auth";
import { api, getErrorMessage } from "../lib/api";
import { Button } from "./ui";

interface Props {
  /** ISO date (yyyy-mm-dd) the export starts at, inclusive. */
  from?: string;
  /** ISO date (yyyy-mm-dd) the export ends at, inclusive. */
  to?: string;
  /** Shown under the button so the manager knows what the file will cover. */
  label?: string;
  className?: string;
}

/** Pulls the server's filename out of Content-Disposition. */
const filenameFrom = (disposition: unknown, fallback: string): string => {
  if (typeof disposition !== "string") return fallback;

  const match = /filename="?([^";]+)"?/i.exec(disposition);

  return match ? match[1] : fallback;
};

/**
 * A blob arrives even on failure.
 *
 * With responseType "blob", an error body is a Blob too, so the usual
 * getErrorMessage finds no JSON and reports "Something went wrong". Reading it
 * back as text recovers the server's actual message — "That range covers
 * 12,000 orders…" — which is the one the manager can act on.
 */
const messageFromBlobError = async (error: unknown): Promise<string> => {
  const body = (error as { response?: { data?: unknown } })?.response?.data;

  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text()) as { message?: string };

      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON — fall through to the generic message below.
    }
  }

  return getErrorMessage(error);
};

const ExportOrdersButton = ({ from, to, label, className = "" }: Props) => {
  const { can } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const download = useMutation({
    mutationFn: async () => {
      const response = await api.get("/admin/exports/orders", {
        params: {
          // `to` is sent as the end of that day: a date alone means midnight,
          // which would silently drop every order placed during it.
          ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
          ...(to ? { to: `${to}T23:59:59.999Z` } : {}),
        },
        responseType: "blob",
      });

      const filename = filenameFrom(
        response.headers["content-disposition"],
        "orders.xlsx"
      );

      // The standard "click a temporary anchor" download. The object URL holds
      // the whole workbook in memory until revoked, so it is released as soon
      // as the browser has taken it.
      const url = URL.createObjectURL(response.data as Blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onMutate: () => setError(null),
    onError: async (failure) => setError(await messageFromBlobError(failure)),
  });

  if (!can("order:export")) return null;

  return (
    <div className={className}>
      <Button
        variant="secondary"
        disabled={download.isPending}
        onClick={() => download.mutate()}
      >
        {download.isPending ? "Building the workbook…" : "⬇ Export to Excel"}
      </Button>

      {label && !error && (
        <p className="mt-1.5 text-[11px] text-ivory-faint">{label}</p>
      )}

      {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
    </div>
  );
};

export default ExportOrdersButton;
