/**
 * Admin dashboard — live trading figures and the current floor state.
 *
 * Every number refreshes automatically as orders move, because the socket
 * invalidates the dashboard query alongside the order queries.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Card, ErrorBox, Spinner, StatusBadge } from "../../components/ui";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, timeAgo } from "../../lib/format";
import type {
  ApiResponse,
  DashboardSummary,
  Order,
  TopSellingItem,
} from "../../types/api";

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

/** How the highest-selling list is ranked. */
type Sort = "quantity" | "revenue";

/** Which orders the figures count. */
type Scope = "completed" | "all";

/** A sortable column header for the highest-selling table. */
const SortHeader = ({
  label,
  column,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  column: Sort;
  sort: Sort;
  onSort: (next: Sort) => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={() => onSort(column)}
    aria-sort={sort === column ? "descending" : "none"}
    className={`text-xs font-semibold uppercase tracking-wide transition ${
      sort === column ? "text-orange-600" : "text-slate-400 hover:text-slate-600"
    } ${className}`}
  >
    {label}
    {sort === column ? " ↓" : ""}
  </button>
);

const AdminDashboard = () => {
  /**
   * Ranking and scope are server-side, not a client-side re-sort of one page
   * of rows: the endpoint returns only the top N, so sorting what arrived
   * would reorder the top ten by quantity rather than showing the top ten by
   * revenue — a different and wrong list.
   */
  const [sort, setSort] = useState<Sort>("quantity");
  const [scope, setScope] = useState<Scope>("completed");

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<DashboardSummary>>("/admin/reports/dashboard")),
    refetchInterval: 60_000,
  });

  const recentQuery = useQuery({
    queryKey: [...queryKeys.orders, "recent"],
    queryFn: async () => unwrap(await api.get<ApiResponse<Order[]>>("/orders?limit=8")),
  });

  const topItemsQuery = useQuery({
    queryKey: ["reports", "top-items", sort, scope],
    queryFn: async () =>
      unwrap(
        await api.get<ApiResponse<TopSellingItem[]>>(
          `/admin/reports/top-items?sort=${sort}&scope=${scope}&limit=10`
        )
      ),
    // Keeps the previous list on screen while a re-sort loads, so the panel
    // does not blink to empty on every toggle.
    placeholderData: (previous) => previous,
  });

  if (summaryQuery.isLoading) return <Spinner label="Loading dashboard" />;

  if (summaryQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(summaryQuery.error)}
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  const summary = summaryQuery.data;
  if (!summary) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>

      <section>
        <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Today
          {/* Which day, under whose clock. The trading day is a wall-clock day
              in the restaurant's own timezone, which need not be the one this
              browser is in. */}
          <span className="text-xs font-normal normal-case tracking-normal text-slate-400">
            {summary.today.date} · {summary.today.timezone}
          </span>
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Stat
            label="Revenue"
            value={formatMoney(summary.today.revenue)}
            accent="text-emerald-600"
          />
          <Stat label="Orders" value={summary.today.orders} />
          <Stat
            label="Average order"
            value={formatMoney(summary.today.averageOrderValue)}
          />
          <Stat
            label="Open now"
            value={summary.live.openOrders}
            hint={`${summary.live.pending} new · ${summary.live.preparing} cooking · ${summary.live.ready} ready`}
            accent="text-orange-600"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Floor &amp; menu
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Stat
            label="Tables occupied"
            value={`${summary.tables.occupied} / ${summary.tables.total}`}
            hint={`${summary.tables.free} free`}
          />
          <Stat label="Menu items" value={summary.menu.total} />
          <Stat
            label="Sold out"
            value={summary.menu.soldOut}
            accent={summary.menu.soldOut > 0 ? "text-red-600" : "text-slate-900"}
          />
          <Stat label="Customers" value={summary.customers} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent orders
            </h2>
            <Link to="/staff" className="text-sm font-medium text-orange-600">
              View all →
            </Link>
          </div>

          <Card className="divide-y divide-slate-100 p-0">
            {recentQuery.data?.length === 0 && (
              <p className="p-5 text-sm text-slate-500">No orders yet today.</p>
            )}

            {recentQuery.data?.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 sm:flex-nowrap sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{order.orderNumber}</p>
                  <p className="text-xs text-slate-500">
                    {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"} ·{" "}
                    {timeAgo(order.placedAt)}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <span className="ml-auto text-right text-sm font-semibold sm:ml-0 sm:w-20">
                  {formatMoney(order.totalAmount)}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Highest selling items
            </h2>

            {/* Completed by default: an order still in the pass may yet be
                cancelled, so counting it would let the ranking move backwards
                during service. */}
            <div className="flex gap-1 rounded-lg bg-slate-200/60 p-0.5">
              {(
                [
                  { value: "completed", label: "Completed" },
                  { value: "all", label: "All orders" },
                ] as { value: Scope; label: string }[]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setScope(option.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    scope === option.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Card className="p-0">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5">
              <span className="w-5" />
              <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Item
              </span>
              <SortHeader
                label="Qty"
                column="quantity"
                sort={sort}
                onSort={setSort}
                className="w-12 text-right sm:w-20"
              />
              <SortHeader
                label="Revenue"
                column="revenue"
                sort={sort}
                onSort={setSort}
                className="w-20 text-right sm:w-24"
              />
            </div>

            {topItemsQuery.isError && (
              <div className="p-4">
                <ErrorBox message={getErrorMessage(topItemsQuery.error)} />
              </div>
            )}

            {topItemsQuery.data?.length === 0 && (
              <p className="p-5 text-sm text-slate-500">
                {scope === "completed"
                  ? "No completed orders yet. Switch to “All orders” to include those still in service."
                  : "No sales recorded yet."}
              </p>
            )}

            <div className="divide-y divide-slate-100">
              {topItemsQuery.data?.map((item, index) => (
                <div key={item.foodId} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-5 text-sm font-bold text-slate-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                    {item.foodName}
                  </span>
                  <span
                    className={`w-12 text-right text-sm tabular-nums sm:w-20 ${
                      sort === "quantity"
                        ? "font-semibold text-slate-900"
                        : "text-slate-500"
                    }`}
                  >
                    {item.quantitySold}
                  </span>
                  <span
                    className={`w-20 text-right text-sm tabular-nums sm:w-24 ${
                      sort === "revenue"
                        ? "font-semibold text-slate-900"
                        : "text-slate-500"
                    }`}
                  >
                    {formatMoney(item.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
