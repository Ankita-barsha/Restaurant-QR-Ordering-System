/**
 * QR landing — /t/:token
 *
 * The first thing a diner sees after scanning, so it does one job: confirm
 * they are at the right table. The number is set enormous because it is read
 * at a glance, in low light, on a phone held at arm's length.
 */

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { LuxeButton, LuxeError, LuxeLoader, Stars } from "../../components/luxe";
import { useCart } from "../../context/cart";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse, PublicSettings, ScannedTable } from "../../types/api";

import heroImage from "../../assets/image/hero.jpg";

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
    // A bad QR will not become valid on retry; failing fast shows a clear
    // message instead of a spinner that never resolves.
    retry: false,
    enabled: token.length > 0,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const table = tableQuery.data;

  useEffect(() => {
    if (table) setTableSession(table, token);
  }, [table, token, setTableSession]);

  if (tableQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian">
        <LuxeLoader label="Finding your table" />
      </div>
    );
  }

  if (tableQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian px-6">
        <div className="w-full max-w-md">
          <LuxeError message={getErrorMessage(tableQuery.error)} />
          <p className="mt-6 text-center text-[13px] leading-relaxed text-ivory-faint">
            Please ask a member of staff, or scan the code on your table again.
          </p>
        </div>
      </div>
    );
  }

  if (!table) return null;

  const closed = settingsQuery.data && !settingsQuery.data.isAcceptingOrders;

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-obsidian px-4 py-10 sm:px-6">
      <div className="absolute inset-0">
        <img src={heroImage} alt="" className="animate-kenburns h-full w-full object-cover" />
        <div className="absolute inset-0 bg-obsidian/88" />
      </div>

      <div className="relative z-10 w-full max-w-md text-center">
        <p className="animate-rise eyebrow">Welcome to</p>

        <h1 className="animate-rise delay-1 mt-4 text-[clamp(2rem,9vw,3rem)] leading-tight text-ivory">
          {settingsQuery.data?.name ?? "Bite me Bistro"}
        </h1>

        <div className="animate-rise delay-1 mt-6 flex items-center justify-center gap-4">
          <span className="rule-fade h-px w-12" />
          <Stars />
          <span className="rule-fade h-px w-12" />
        </div>

        {/* The table number is why this screen exists. */}
        <div className="glass rounded-luxe animate-rise delay-2 mt-10 px-5 py-8 sm:mt-12 sm:px-8 sm:py-10">
          <p className="eyebrow">You are seated at</p>

          <p className="font-display mt-3 text-[clamp(4rem,22vw,6rem)] leading-none text-gold-gradient">
            {table.tableNumber}
          </p>

          <p className="mt-4 text-[13px] text-ivory-faint">
            Seats up to {table.capacity} · Order from your phone, at your pace
          </p>
        </div>

        {closed ? (
          <p className="animate-rise delay-3 mt-8 rounded-full border border-ember/40 px-6 py-3.5 text-[11px] uppercase tracking-[0.2em] text-ember">
            The kitchen is closed right now
          </p>
        ) : (
          <div className="animate-rise delay-3 mt-10">
            <LuxeButton className="w-full" onClick={() => navigate("/menu")}>
              View the menu
            </LuxeButton>
          </div>
        )}

        <Link
          to="/track"
          className="animate-rise delay-4 mt-6 flex min-h-11 items-center justify-center text-[10px] uppercase tracking-[0.24em] text-ivory-faint transition-colors hover:text-gold"
        >
          Track an existing order
        </Link>
      </div>
    </div>
  );
};

export default ScanTable;
