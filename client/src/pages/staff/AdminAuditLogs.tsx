/**
 * Audit trail viewer — Super Admin panel.
 *
 * Read-only, because the server has no update or delete endpoint for audit
 * rows. A log that can be edited is not evidence, so there is deliberately
 * nothing to click here except filters.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { api, getErrorMessage } from "../../lib/api";
import type { ApiResponse, PaginationMeta } from "../../types/api";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
  after: unknown;
  actor: { id: string; fullName: string; email: string } | null;
}

/** Colour by verb, so destructive actions stand out when scanning the list. */
const actionStyle = (action: string): string => {
  if (action.includes("delete") || action.includes("deactivate") || action.includes("cancel")) {
    return "bg-red-100 text-red-700";
  }
  if (action.includes("create")) return "bg-emerald-100 text-emerald-700";
  if (action.includes("Password") || action.includes("Permissions")) {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-blue-100 text-blue-700";
};

const AdminAuditLogs = () => {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const logsQuery = useQuery({
    queryKey: ["admin", "audit", entity, action, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "25" });

      if (entity) params.set("entity", entity);
      if (action) params.set("action", action);

      const response = await api.get<ApiResponse<AuditLog[]>>(
        `/admin/audit-logs?${params.toString()}`
      );

      return { logs: response.data.data, meta: response.data.meta as PaginationMeta };
    },
  });

  if (logsQuery.isLoading) return <Spinner label="Loading audit trail" />;

  if (logsQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(logsQuery.error)}
        onRetry={() => void logsQuery.refetch()}
      />
    );
  }

  const logs = logsQuery.data?.logs ?? [];
  const meta = logsQuery.data?.meta;

  return (
    <div>
      <h1 className="text-xl font-bold text-white-900">Audit trail</h1>
      <p className="mt-1 text-sm text-white-500">
        Every privileged action, with who did it and from where. Append-only —
        entries cannot be edited or removed.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={entity}
          onChange={(event) => {
            setEntity(event.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All entities</option>
          {["User", "Role", "Food", "Category", "Order", "Table", "RestaurantSettings"].map(
            (option) => (
              <option key={option} value={option}>
                {option}
              </option>
            )
          )}
        </select>

        <input
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          placeholder="Filter by action, e.g. delete"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {logs.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No audit entries"
            hint="Actions like creating a user or changing permissions appear here."
          />
        </div>
      ) : (
        <Card className="mt-4 divide-y divide-slate-100 p-0">
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center gap-3 p-4">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${actionStyle(
                  log.action
                )}`}
              >
                {log.action}
              </span>

              <span className="text-sm text-white-700">{log.entity}</span>

              <span className="min-w-0 flex-1 truncate text-sm text-white-500">
                {log.actor ? log.actor.fullName : "System"}
                {log.actor && (
                  <span className="text-white-400"> · {log.actor.email}</span>
                )}
              </span>

              {log.ipAddress && (
                <code className="text-xs text-white-400">{log.ipAddress}</code>
              )}

              <time className="text-xs text-white-400">
                {new Date(log.createdAt).toLocaleString()}
              </time>
            </div>
          ))}
        </Card>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((previous) => previous - 1)}
            disabled={!meta.hasPreviousPage}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white-600 disabled:opacity-40"
          >
            ← Previous
          </button>

          <span className="text-sm text-white-500">
            Page {meta.page} of {meta.totalPages} · {meta.total} entries
          </span>

          <button
            type="button"
            onClick={() => setPage((previous) => previous + 1)}
            disabled={!meta.hasNextPage}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-white-600 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminAuditLogs;
