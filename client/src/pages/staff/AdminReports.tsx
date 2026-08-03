/**
 * Manager reports.
 *
 * Revenue over time at four grains — daily, weekly, monthly, yearly — plus the
 * cash-versus-online split the manager reconciles the till against, and the
 * outstanding total still to be collected. Aggregation happens in the
 * database; this screen only renders what it returns.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import ExportOrdersButton from "../../components/ExportOrdersButton";
import { Card, ErrorBox, Spinner } from "../../components/ui";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import type { ApiResponse, TopSellingItem } from "../../types/api";

type Period = "daily" | "weekly" | "monthly" | "yearly";

interface RevenueReport {
  period: Period;
  label: string;
  buckets: { date: string; orders: number; revenue: string }[];
  payments: { method: string; total: string; count: number }[];
  totals: {
    orders: number;
    revenue: string;
    collected: string;
    outstanding: string;
    outstandingCount: number;
  };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const METHOD_STYLE: Record<string, string> = {
  CASH: "text-emerald-400 font-semibold",
  ONLINE: "text-blue-400 font-semibold",
  CARD: "text-purple-400 font-semibold",
  UPI: "text-gold font-semibold",
  UNRECORDED: "text-ivory-dim",
};

/** Formats a bucket date according to how coarse the period is. */
const formatBucket = (iso: string, period: Period): string => {
  const date = new Date(iso);

  if (period === "yearly") return String(date.getFullYear());
  if (period === "monthly")
    return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  if (period === "weekly")
    return `w/c ${date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** yyyy-mm-dd in the browser's own timezone, which is what a date input wants. */
const isoDay = (date: Date): string =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);

const AdminReports = () => {
  const [period, setPeriod] = useState<Period>("daily");

  /**
   * The export window, defaulted to the current month.
   *
   * A month is the unit these figures are actually reconciled in, and it keeps
   * the first download small enough to open instantly. Both boxes clear to
   * "everything", which the server caps rather than refuses outright.
   */
  const [exportFrom, setExportFrom] = useState(() => {
    const now = new Date();

    return isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [exportTo, setExportTo] = useState(() => isoDay(new Date()));

  const revenueQuery = useQuery({
    queryKey: ["reports", "revenue", period],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<RevenueReport>>(
          `/admin/reports/revenue?period=${period}`
        )
      ),
  });

  const topItemsQuery = useQuery({
    queryKey: ["reports", "top-items", "all"],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<TopSellingItem[]>>(
          "/admin/reports/top-items?scope=all&limit=10"
        )
      ),
  });

  if (revenueQuery.isLoading) return <Spinner label="Loading reports" />;

  if (revenueQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(revenueQuery.error)}
        onRetry={() => void revenueQuery.refetch()}
      />
    );
  }

  const report = revenueQuery.data;
  if (!report) return null;

  const peak = Math.max(
    1,
    ...report.buckets.map((bucket) => Number(bucket.revenue))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Reports</h1>
          <p className="mt-0.5 text-sm text-ivory-dim">{report.label}</p>
        </div>

        <div className="flex gap-1 rounded-xl bg-graphite border border-smoke p-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                period === option.value
                  ? "bg-gold text-obsidian shadow-sm font-bold"
                  : "text-ivory-dim hover:text-ivory"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- excel export ---- */}
      {/*
        Its own dates rather than the period buttons above. The buttons pick how
        the CHART is bucketed; an accountant exporting a quarter does not want
        that decision made for them by whichever tab happened to be open.
      */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ivory-dim">
              Order book export
            </p>
            <p className="mt-1 text-xs text-ivory-faint">
              Three sheets — every order in sequence, every dish with its plate
              count, and a summary per diner.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-ivory-dim">
                From{" "}
                <input
                  type="date"
                  value={exportFrom}
                  max={exportTo || undefined}
                  onChange={(event) => setExportFrom(event.target.value)}
                  className="ml-1 rounded-lg border border-smoke bg-graphite px-2 py-1.5 text-xs text-ivory outline-none focus:border-gold"
                />
              </label>
              <label className="text-xs text-ivory-dim">
                To{" "}
                <input
                  type="date"
                  value={exportTo}
                  min={exportFrom || undefined}
                  onChange={(event) => setExportTo(event.target.value)}
                  className="ml-1 rounded-lg border border-smoke bg-graphite px-2 py-1.5 text-xs text-ivory outline-none focus:border-gold"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setExportFrom("");
                  setExportTo("");
                }}
                className="text-[11px] uppercase tracking-wider text-ivory-faint hover:text-ivory"
              >
                Clear
              </button>
            </div>
          </div>

          <ExportOrdersButton
            from={exportFrom || undefined}
            to={exportTo || undefined}
            label={
              exportFrom || exportTo
                ? `${exportFrom || "the beginning"} → ${exportTo || "today"}`
                : "Every order on record"
            }
          />
        </div>
      </Card>

      {/* ------------------------------------------------------- headline ---- */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(report.totals.revenue)} accent="text-emerald-400 font-bold" />
        <Stat label="Collected" value={formatMoney(report.totals.collected)} />
        <Stat
          label="Outstanding"
          value={formatMoney(report.totals.outstanding)}
          hint={`${report.totals.outstandingCount} unpaid order(s)`}
          accent={
            Number(report.totals.outstanding) > 0 ? "text-ember font-bold" : "text-ivory"
          }
        />
        <Stat label="Orders" value={report.totals.orders} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* --------------------------------------------- revenue over time -- */}
        <Card className="bg-charcoal">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
            Revenue over time
          </h2>

          {report.buckets.length === 0 ? (
            <p className="py-10 text-center text-sm text-ivory-dim">
              No revenue recorded in this period yet.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {report.buckets.map((bucket) => (
                <div key={bucket.date} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-ivory-dim">
                    {formatBucket(bucket.date, period)}
                  </span>

                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-graphite border border-smoke">
                    <div
                      className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-amber-500 to-gold px-2"
                      style={{
                        width: `${Math.max(6, (Number(bucket.revenue) / peak) * 100)}%`,
                      }}
                    >
                      <span className="text-[10px] font-bold text-obsidian">
                        {bucket.orders}
                      </span>
                    </div>
                  </div>

                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-ivory">
                    {formatMoney(bucket.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* --------------------------------------------- payment split ------ */}
        <Card className="bg-charcoal">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
            How guests paid
          </h2>

          {report.payments.length === 0 ? (
            <p className="py-10 text-center text-sm text-ivory-dim">
              No payments collected yet.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {report.payments.map((payment) => (
                <div
                  key={payment.method}
                  className="flex items-center justify-between border-b border-smoke pb-3 last:border-0"
                >
                  <div>
                    <p
                      className={`text-sm ${
                        METHOD_STYLE[payment.method] ?? "text-ivory"
                      }`}
                    >
                      {payment.method === "UNRECORDED" ? "Method not set" : payment.method}
                    </p>
                    <p className="text-xs text-ivory-faint">{payment.count} order(s)</p>
                  </div>
                  <span className="text-sm font-semibold text-gold">
                    {formatMoney(payment.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------- best sellers */}
      <Card className="p-0 bg-charcoal">
        <h2 className="border-b border-smoke px-5 py-4 text-sm font-semibold uppercase tracking-wide text-gold">
          Highest selling items
          <span className="ml-2 text-xs font-normal normal-case tracking-normal text-ivory-faint">
            all orders · by quantity
          </span>
        </h2>

        {topItemsQuery.data?.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ivory-dim">No sales recorded yet.</p>
        ) : (
          <div className="divide-y divide-smoke">
            {topItemsQuery.data?.slice(0, 10).map((item, index) => (
              <div key={item.foodId} className="flex items-center gap-3 px-5 py-3 hover:bg-graphite/40 transition">
                <span className="w-5 text-sm font-bold text-gold">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ivory">
                  {item.foodName}
                </span>
                <span className="text-xs text-ivory-dim font-mono">{item.quantitySold} sold</span>
                <span className="w-24 text-right text-sm font-semibold text-gold">
                  {formatMoney(item.revenue)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const Stat = ({
  label,
  value,
  hint,
  accent = "text-ivory",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) => (
  <Card className="bg-charcoal">
    <p className="text-xs font-medium uppercase tracking-wide text-ivory-dim">{label}</p>
    <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-ivory-faint">{hint}</p>}
  </Card>
);

export default AdminReports;
