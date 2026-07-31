/**
 * Staff account management — Super Admin panel.
 *
 * Deactivation is soft on the server (User is referenced by orders and audit
 * logs), so the wording here says "deactivate", never "delete": the account
 * stops working but its history survives.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
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

const inputClass =
  "w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Staff Accounts</h1>
          <p className="mt-0.5 text-sm text-ivory-dim">Manage system access, roles, and permissions.</p>
        </div>

        {can("user:create") && (
          <Button onClick={() => setShowForm((previous) => !previous)} className="font-bold uppercase tracking-wider text-xs">
            {showForm ? "Close form" : "+ Add staff member"}
          </Button>
        )}
      </div>

      {mutationError && (
        <div>
          <ErrorBox message={getErrorMessage(mutationError)} />
        </div>
      )}

      {showForm && (
        <Card className="bg-charcoal border border-smoke">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              createUser.mutate(Object.fromEntries(form) as Record<string, string>);
            }}
            className="grid gap-3.5 sm:grid-cols-2"
          >
            <input
              name="fullName"
              required
              placeholder="Full name"
              className={inputClass}
            />
            <input
              name="email"
              type="email"
              required
              placeholder="Email address"
              className={inputClass}
            />
            <input
              name="password"
              type="password"
              required
              placeholder="Password (12+ chars, mixed case, number)"
              className={inputClass}
            />
            <select
              name="roleId"
              required
              className={inputClass}
            >
              <option value="">Choose a role…</option>
              {rolesQuery.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>

            <Button type="submit" disabled={createUser.isPending} className="sm:col-span-2 font-bold uppercase tracking-wider">
              {createUser.isPending ? "Creating…" : "Create staff account"}
            </Button>
          </form>
        </Card>
      )}

      {usersQuery.data?.length === 0 && (
        <div>
          <EmptyState title="No staff accounts yet" />
        </div>
      )}

      <div className="grid gap-3">
        {usersQuery.data?.map((staff) => {
          const isSelf = staff.id === currentUser?.id;

          return (
            <Card
              key={staff.id}
              className={`p-4 bg-charcoal border border-smoke ${staff.isActive ? "" : "opacity-60"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ivory text-base">
                    {staff.fullName}
                    {isSelf && (
                      <span className="ml-2.5 rounded bg-gold/20 border border-gold/40 px-2 py-0.5 text-xs font-bold text-gold">
                        You
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-ivory-dim">{staff.email}</p>
                </div>

                <span className="rounded-full bg-graphite border border-smoke px-3 py-1 text-xs font-semibold text-gold">
                  {staff.role.name}
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    staff.isActive
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/15 text-red-400 border border-red-500/30"
                  }`}
                >
                  {staff.isActive ? "Active" : "Deactivated"}
                </span>
              </div>

              <p className="mt-2 text-xs text-ivory-faint">
                {staff.lastLoginAt
                  ? `Last signed in ${new Date(staff.lastLoginAt).toLocaleString()}`
                  : "Never signed in"}
              </p>

              {staff.isActive && (
                <div className="mt-3.5 flex flex-wrap gap-2 pt-2 border-t border-smoke/40">
                  {can("user:update") && (
                    <Button variant="secondary" onClick={() => setResettingId(staff.id)} className="font-bold text-xs">
                      Reset password
                    </Button>
                  )}

                  {can("user:delete") && !isSelf && (
                    <Button
                      variant="danger"
                      onClick={() => deactivate.mutate(staff.id)}
                      disabled={deactivate.isPending}
                      className="font-bold text-xs"
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              )}

              {resettingId === staff.id && (
                <div className="mt-3 rounded-xl bg-gold/15 border border-gold/30 p-3">
                  <p className="text-xs font-semibold text-gold">
                    This signs {staff.fullName} out of every device immediately.
                  </p>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="New password"
                    className="mt-2 w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory outline-none focus:border-gold"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      disabled={!newPassword || resetPassword.isPending}
                      onClick={() =>
                        resetPassword.mutate({ id: staff.id, password: newPassword })
                      }
                      className="font-bold text-xs"
                    >
                      Set password
                    </Button>
                    <Button variant="ghost" onClick={() => setResettingId(null)} className="font-bold text-xs">
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
