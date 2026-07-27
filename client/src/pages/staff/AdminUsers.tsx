/**
 * Staff account management — Super Admin panel.
 *
 * Deactivation is soft on the server (User is referenced by orders and audit
 * logs), so the wording here says "deactivate", never "delete": the account
 * stops working but its history survives.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, EmptyState, ErrorBox, Spinner } from "../../components/ui";
import { useAuth } from "../../context/auth";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse } from "../../types/api";

interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  role: { id: string; name: string; description: string | null };
}

interface RoleSummary {
  id: string;
  name: string;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

const AdminUsers = () => {
  const { can, user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<StaffUser[]>>("/admin/users?includeInactive=true")),
  });

  const rolesQuery = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: async () => unwrap(await api.get<ApiResponse<RoleSummary[]>>("/admin/roles")),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
  };

  const createUser = useMutation({
    mutationFn: async (payload: Record<string, string>) => api.post("/admin/users", payload),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      api.post(`/admin/users/${id}/reset-password`, { newPassword: password }),
    onSuccess: () => {
      setResettingId(null);
      setNewPassword("");
      invalidate();
    },
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/users/${id}`),
    onSuccess: invalidate,
  });

  if (usersQuery.isLoading) return <Spinner label="Loading staff accounts" />;

  if (usersQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(usersQuery.error)}
        onRetry={() => void usersQuery.refetch()}
      />
    );
  }

  const mutationError = createUser.error ?? resetPassword.error ?? deactivate.error;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Staff accounts</h1>

        {can("user:create") && (
          <Button onClick={() => setShowForm((previous) => !previous)}>
            {showForm ? "Close" : "Add staff"}
          </Button>
        )}
      </div>

      {mutationError && (
        <div className="mt-4">
          <ErrorBox message={getErrorMessage(mutationError)} />
        </div>
      )}

      {showForm && (
        <Card className="mt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              createUser.mutate(Object.fromEntries(form) as Record<string, string>);
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <input
              name="fullName"
              required
              placeholder="Full name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Email"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Password (12+ chars, mixed case, a number)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              name="roleId"
              required
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Choose a role…</option>
              {rolesQuery.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>

            <Button type="submit" disabled={createUser.isPending} className="sm:col-span-2">
              {createUser.isPending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </Card>
      )}

      {usersQuery.data?.length === 0 && (
        <div className="mt-4">
          <EmptyState title="No staff accounts yet" />
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {usersQuery.data?.map((staff) => {
          const isSelf = staff.id === currentUser?.id;

          return (
            <Card
              key={staff.id}
              className={staff.isActive ? "" : "bg-slate-50 opacity-70"}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {staff.fullName}
                    {isSelf && (
                      <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                        you
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-slate-500">{staff.email}</p>
                </div>

                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {staff.role.name}
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    staff.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {staff.isActive ? "Active" : "Deactivated"}
                </span>
              </div>

              <p className="mt-1 text-xs text-slate-400">
                {staff.lastLoginAt
                  ? `Last signed in ${new Date(staff.lastLoginAt).toLocaleString()}`
                  : "Never signed in"}
              </p>

              {staff.isActive && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {can("user:update") && (
                    <Button variant="secondary" onClick={() => setResettingId(staff.id)}>
                      Reset password
                    </Button>
                  )}

                  {/* The server also refuses self-deactivation and removing the
                      last super admin; hiding the button avoids a pointless
                      round trip for the obvious case. */}
                  {can("user:delete") && !isSelf && (
                    <Button
                      variant="danger"
                      onClick={() => deactivate.mutate(staff.id)}
                      disabled={deactivate.isPending}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              )}

              {resettingId === staff.id && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-900">
                    This signs {staff.fullName} out of every device immediately.
                  </p>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    className="mt-2 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      disabled={!newPassword || resetPassword.isPending}
                      onClick={() =>
                        resetPassword.mutate({ id: staff.id, password: newPassword })
                      }
                    >
                      Set password
                    </Button>
                    <Button variant="ghost" onClick={() => setResettingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminUsers;
