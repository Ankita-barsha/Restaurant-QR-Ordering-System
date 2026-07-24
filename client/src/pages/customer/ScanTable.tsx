/**
 * QR landing page — /t/:token
 *
 * The first screen a diner sees after scanning. It resolves the token to a
 * table, SHOWS THE TABLE NUMBER so they can confirm they are at the right
 * place, and stores the session before sending them to the menu.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ErrorBox, Spinner } from "../../components/ui";
import { useCart } from "../../context/CartContext";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse, PublicSettings, ScannedTable } from "../../types/api";

const ScanTable = () => {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { setTableSession } = useCart();

  const tableQuery = useQuery({
    queryKey: ["scan", token],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<{ table: ScannedTable }>>(`/tables/scan/${token}`)
      ).table,
    // A bad QR code will not become valid on retry; failing fast shows the
    // diner a clear message instead of a spinner that never resolves.
    retry: false,
    enabled: token.length > 0,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const table = tableQuery.data;

  // Stored as soon as the token resolves, so the menu and checkout know which
  // table this diner is at even after a reload.
  useEffect(() => {
    if (table) {
      setTableSession(table, token);
    }
  }, [table, token, setTableSession]);

  if (tableQuery.isLoading) {
    return <Spinner label="Checking your table" />;
  }

  if (tableQuery.isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorBox message={getErrorMessage(tableQuery.error)} />
        <p className="mt-4 text-sm text-slate-500">
          Ask a staff member for help, or scan the code on your table again.
        </p>
      </div>
    );
  }

  if (!table) return null;

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center p-6">
      <div className="rounded-3xl bg-gradient-to-br from-orange-500 to-amber-500 p-8 text-center text-white shadow-lg">
        <p className="text-sm font-medium uppercase tracking-widest opacity-90">
          Welcome to
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          {settingsQuery.data?.name ?? "Our Restaurant"}
        </h1>

        {/* The table number is the whole point of this screen: the diner must
            be able to confirm at a glance that they scanned their own table. */}
        <div className="mt-8 rounded-2xl bg-white/15 p-6 backdrop-blur">
          <p className="text-xs uppercase tracking-widest opacity-90">You are seated at</p>
          <p className="mt-2 text-6xl font-black tracking-tight">{table.tableNumber}</p>
          <p className="mt-2 text-sm opacity-90">Seats up to {table.capacity}</p>
        </div>
      </div>

      {settingsQuery.data && !settingsQuery.data.isAcceptingOrders ? (
        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-center text-sm text-amber-800">
          We are not accepting orders right now. Please ask a staff member.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => navigate("/menu")}
          className="mt-6 w-full rounded-2xl bg-slate-900 px-6 py-4 text-base font-semibold text-white transition hover:bg-slate-800"
        >
          View Menu &amp; Order
        </button>
      )}

      <Link
        to="/track"
        className="mt-3 text-center text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        Track an existing order
      </Link>
    </div>
  );
};

export default ScanTable;
