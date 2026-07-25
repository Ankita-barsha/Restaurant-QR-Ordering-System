/**
 * Manager reports.
 *
 * Revenue over time at four grains — daily, weekly, monthly, yearly — plus the
 * cash-versus-online split the manager reconciles the till against, and the
 * outstanding total still to be collected. Aggregation happens in the
 * database; this screen only renders what it returns.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card, ErrorBox, Spinner } from "../../components/ui";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney } from "../../lib/format";
import type { ApiResponse } from "../../types/api";

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

interface TopItem {
  foodId: string;
  foodName: string;
  quantitySold: number;
  revenue: string;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const METHOD_STYLE: Record<string, string> = {
  CASH: "text-emerald-500",
  ONLINE: "text-blue-400",
  CARD: "text-purple-400",
  UPI: "text-amber-400",
  UNRECORDED: "text-slate-400",
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

const AdminReports = () => {
  const [period, setPeriod] = useState<Period>("daily");

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
    queryKey: ["reports", "top-items"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<TopItem[]>>("/admin/reports/top-items")),
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

  // Peak revenue drives the bar widths, so the tallest bar fills the row.
  const peak = Math.max(
    1,
    ...report.buckets.map((bucket) => Number(bucket.revenue))
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="mt-0.5 text-sm text-slate-500">{report.label}</p>
        </div>

        <div className="flex gap-1 rounded-xl bg-slate-200/60 p-1">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                period === option.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------- headline ---- */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(report.totals.revenue)} accent="text-emerald-600" />
        <Stat label="Collected" value={formatMoney(report.totals.collected)} />
        <Stat
          label="Outstanding"
          value={formatMoney(report.totals.outstanding)}
          hint={`${report.totals.outstandingCount} unpaid order(s)`}
          accent={
            Number(report.totals.outstanding) > 0 ? "text-red-600" : "text-slate-900"
          }
        />
        <Stat label="Orders" value={report.totals.orders} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* --------------------------------------------- revenue over time -- */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Revenue over time
          </h2>

          {report.buckets.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No revenue recorded in this period yet.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {report.buckets.map((bucket) => (
                <div key={bucket.date} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-slate-500">
                    {formatBucket(bucket.date, period)}
                  </span>

                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-orange-400 to-orange-500 px-2"
                      style={{
                        width: `${Math.max(6, (Number(bucket.revenue) / peak) * 100)}%`,
                      }}
                    >
                      <span className="text-[10px] font-semibold text-white">
                        {bucket.orders}
                      </span>
                    </div>
                  </div>

                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-900">
                    {formatMoney(bucket.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* --------------------------------------------- payment split ------ */}
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            How guests paid
          </h2>

          {report.payments.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              No payments collected yet.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {report.payments.map((payment) => (
                <div
                  key={payment.method}
                  className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"
                >
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        METHOD_STYLE[payment.method] ?? "text-slate-700"
                      }`}
                    >
                      {payment.method === "UNRECORDED" ? "Method not set" : payment.method}
                    </p>
                    <p className="text-xs text-slate-500">{payment.count} order(s)</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatMoney(payment.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------- best sellers */}
      <Card className="mt-6 p-0">
        <h2 className="border-b border-slate-100 px-5 py-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Best sellers
        </h2>

        {topItemsQuery.data?.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No sales recorded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {topItemsQuery.data?.slice(0, 10).map((item, index) => (
              <div key={item.foodId} className="flex items-center gap-3 px-5 py-3">
                <span className="w-5 text-sm font-bold text-slate-400">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {item.foodName}
                </span>
                <span className="text-xs text-slate-500">{item.quantitySold} sold</span>
                <span className="w-24 text-right text-sm font-semibold text-slate-900">
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
  accent = "text-slate-900",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) => (
  <Card>
    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
  </Card>
);

export default AdminReports;
