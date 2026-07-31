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
  accent = "text-ivory",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) => (
  <Card>
    <p className="text-xs font-medium uppercase tracking-wide text-ivory-dim">{label}</p>
    <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
    {hint && <p className="mt-0.5 text-xs text-ivory-faint">{hint}</p>}
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
      sort === column ? "text-gold" : "text-ivory-faint hover:text-ivory"
    } ${className}`}
  >
    {label}
    {sort === column ? " ↓" : ""}
  </button>
);

const AdminDashboard = () => {
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
      <h1 className="text-2xl font-bold text-ivory font-display">Dashboard</h1>

      <section>
        <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold uppercase tracking-wide text-gold">
          Today
          <span className="text-xs font-normal normal-case tracking-normal text-ivory-faint">
            {summary.today.date} · {summary.today.timezone}
          </span>
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Stat
            label="Revenue"
            value={formatMoney(summary.today.revenue)}
            accent="text-emerald-400 font-bold"
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
            accent="text-gold font-bold"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gold">
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
            accent={summary.menu.soldOut > 0 ? "text-ember" : "text-ivory"}
          />
          <Stat label="Customers" value={summary.customers} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
              Recent orders
            </h2>
            <Link to="/staff" className="text-sm font-medium text-gold hover:underline">
              View all →
            </Link>
          </div>

          <Card className="divide-y divide-smoke p-0 bg-charcoal">
            {recentQuery.data?.length === 0 && (
              <p className="p-5 text-sm text-ivory-dim">No orders yet today.</p>
            )}

            {recentQuery.data?.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 sm:flex-nowrap sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ivory">{order.orderNumber}</p>
                  <p className="text-xs text-ivory-dim">
                    {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"} ·{" "}
                    {timeAgo(order.placedAt)}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <span className="ml-auto text-right text-sm font-semibold text-gold sm:ml-0 sm:w-20">
                  {formatMoney(order.totalAmount)}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gold">
              Highest selling items
            </h2>

            <div className="flex gap-1 rounded-lg bg-graphite border border-smoke p-1">
              <button
                type="button"
                onClick={() => setScope("completed")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  scope === "completed"
                    ? "bg-gold text-obsidian font-bold shadow-sm"
                    : "text-ivory-dim hover:text-ivory"
                }`}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setScope("all")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  scope === "all"
                    ? "bg-gold text-obsidian font-bold shadow-sm"
                    : "text-ivory-dim hover:text-ivory"
                }`}
              >
                All states
              </button>
            </div>
          </div>

          <Card className="p-0 bg-charcoal">
            {topItemsQuery.isLoading && (
              <p className="p-5 text-sm text-ivory-dim">Loading top items...</p>
            )}

            {topItemsQuery.isError && (
              <p className="p-5 text-sm text-ember">Failed to load top items.</p>
            )}

            {topItemsQuery.data && topItemsQuery.data.length === 0 && (
              <p className="p-5 text-sm text-ivory-dim">No items sold yet.</p>
            )}

            {topItemsQuery.data && topItemsQuery.data.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-ivory">
                  <thead className="border-b border-smoke bg-graphite text-xs uppercase text-ivory-dim">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Dish</th>
                      <th className="px-4 py-3 text-right">
                        <SortHeader
                          label="Qty"
                          column="quantity"
                          sort={sort}
                          onSort={setSort}
                        />
                      </th>
                      <th className="px-4 py-3 text-right">
                        <SortHeader
                          label="Revenue"
                          column="revenue"
                          sort={sort}
                          onSort={setSort}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-smoke">
                    {topItemsQuery.data.map((item) => (
                      <tr key={item.foodId} className="hover:bg-graphite/40 transition">
                        <td className="px-4 py-3 font-medium text-ivory">{item.foodName}</td>
                        <td className="px-4 py-3 text-right text-ivory-dim font-mono">{item.quantitySold}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gold">{formatMoney(item.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
