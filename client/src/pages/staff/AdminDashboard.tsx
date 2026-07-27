/**
 * Admin dashboard — live trading figures and the current floor state.
 *
 * Every number refreshes automatically as orders move, because the socket
 * invalidates the dashboard query alongside the order queries.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Card, ErrorBox, Spinner, StatusBadge } from "../../components/ui";
import { queryKeys } from "../../hooks/useLiveOrders";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import { formatMoney, timeAgo } from "../../lib/format";
import type { ApiResponse, DashboardSummary, Order } from "../../types/api";

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

interface TopItem {
  foodId: string;
  foodName: string;
  quantitySold: number;
  revenue: string;
}

const AdminDashboard = () => {
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
    queryKey: ["reports", "top-items"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<TopItem[]>>("/admin/reports/top-items")),
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
              <div key={order.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{order.orderNumber}</p>
                  <p className="text-xs text-slate-500">
                    {order.table ? `Table ${order.table.tableNumber}` : "Takeaway"} ·{" "}
                    {timeAgo(order.placedAt)}
                  </p>
                </div>
                <StatusBadge status={order.status} />
                <span className="w-20 text-right text-sm font-semibold">
                  {formatMoney(order.totalAmount)}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Best sellers
          </h2>

          <Card className="divide-y divide-slate-100 p-0">
            {topItemsQuery.data?.length === 0 && (
              <p className="p-5 text-sm text-slate-500">No sales recorded yet.</p>
            )}

            {topItemsQuery.data?.slice(0, 8).map((item, index) => (
              <div key={item.foodId} className="flex items-center gap-3 p-4">
                <span className="w-5 text-sm font-bold text-slate-400">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {item.foodName}
                </span>
                <span className="text-xs text-slate-500">{item.quantitySold} sold</span>
                <span className="w-24 text-right text-sm font-semibold">
                  {formatMoney(item.revenue)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
