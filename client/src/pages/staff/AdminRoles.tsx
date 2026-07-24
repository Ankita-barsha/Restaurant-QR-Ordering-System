/**
 * Roles and permissions — Super Admin panel.
 *
 * The permission checklist is the screen that makes RBAC real: granting a
 * capability here takes effect with no code change and no redeploy, because
 * routes are gated on capabilities rather than role names.
 *
 * Saving replaces the whole set in one request, so a half-applied change is
 * not possible if the browser dies mid-edit.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Button, Card, ErrorBox, Spinner } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { api, getErrorMessage, unwrap } from "../../lib/api";
import type { ApiResponse } from "../../types/api";

interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

interface PermissionGroup {
  group: string;
  permissions: { id: string; key: string; description: string | null }[];
}

const AdminRoles = () => {
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);

  const rolesQuery = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: async () => unwrap(await api.get<ApiResponse<Role[]>>("/admin/roles")),
  });

  const permissionsQuery = useQuery({
    queryKey: ["admin", "permissions"],
    queryFn: async () =>
      unwrap(await api.get<ApiResponse<PermissionGroup[]>>("/admin/permissions")),
  });

  const roles = rolesQuery.data ?? [];
  const selected = roles.find((role) => role.id === selectedId) ?? null;

  // The draft resets whenever a different role is opened, so edits to one
  // role can never leak into another.
  useEffect(() => {
    setDraft(new Set(selected?.permissions ?? []));
  }, [selected]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
  };

  const createRole = useMutation({
    mutationFn: async (payload: { name: string; description?: string }) =>
      api.post("/admin/roles", payload),
    onSuccess: () => {
      setShowForm(false);
      invalidate();
    },
  });

  const savePermissions = useMutation({
    mutationFn: async ({ id, keys }: { id: string; keys: string[] }) =>
      api.put(`/admin/roles/${id}/permissions`, { permissionKeys: keys }),
    onSuccess: invalidate,
  });

  const deleteRole = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/roles/${id}`),
    onSuccess: () => {
      setSelectedId(null);
      invalidate();
    },
  });

  if (rolesQuery.isLoading) return <Spinner label="Loading roles" />;

  if (rolesQuery.isError) {
    return (
      <ErrorBox
        message={getErrorMessage(rolesQuery.error)}
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }

  const toggle = (key: string) => {
    setDraft((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // SUPER_ADMIN bypasses permission checks on the server, so its list is not
  // editable — showing a checklist would imply a restriction that is not real.
  const isEditable = selected !== null && selected.name !== "SUPER_ADMIN";

  const isDirty =
    selected !== null &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((key) => !draft.has(key)));

  const mutationError =
    createRole.error ?? savePermissions.error ?? deleteRole.error;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Roles &amp; permissions</h1>

        {can("role:create") && (
          <Button onClick={() => setShowForm((previous) => !previous)}>
            {showForm ? "Close" : "New role"}
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
              createRole.mutate({
                name: String(form.get("name")),
                description: String(form.get("description") || "") || undefined,
              });
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <input
              name="name"
              required
              placeholder="SHIFT_MANAGER"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
            />
            <input
              name="description"
              placeholder="What this role is for"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 sm:col-span-2">
              Use UPPER_SNAKE_CASE. The name is an identifier, so it cannot be
              changed later for built-in roles.
            </p>
            <Button type="submit" disabled={createRole.isPending} className="sm:col-span-2">
              {createRole.isPending ? "Creating…" : "Create role"}
            </Button>
          </form>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="grid h-fit gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedId(role.id)}
              className={`rounded-xl border p-3 text-left transition ${
                selectedId === role.id
                  ? "border-orange-300 bg-orange-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{role.name}</span>
                {role.isSystem && (
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    built-in
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {role.userCount} user(s) · {role.permissions.length} permission(s)
              </p>
            </button>
          ))}
        </div>

        <Card>
          {!selected ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Choose a role to view and edit its permissions.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-slate-500">{selected.description}</p>
                  )}
                </div>

                {can("role:delete") && !selected.isSystem && (
                  <Button
                    variant="danger"
                    onClick={() => deleteRole.mutate(selected.id)}
                    disabled={deleteRole.isPending || selected.userCount > 0}
                  >
                    {selected.userCount > 0
                      ? `In use by ${selected.userCount}`
                      : "Delete role"}
                  </Button>
                )}
              </div>

              {!isEditable ? (
                <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                  The super admin always has full access. Its permissions are not
                  editable, so no configuration mistake can lock every administrator
                  out of the system.
                </div>
              ) : (
                <>
                  <div className="mt-4 space-y-4">
                    {permissionsQuery.data?.map((group) => (
                      <section key={group.group}>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {group.group}
                        </h3>

                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {group.permissions.map((permission) => (
                            <label
                              key={permission.id}
                              className="flex items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={draft.has(permission.key)}
                                onChange={() => toggle(permission.key)}
                                disabled={!can("permission:assign")}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="text-slate-800">
                                  {permission.description ?? permission.key}
                                </span>
                                <code className="ml-1 text-[11px] text-slate-400">
                                  {permission.key}
                                </code>
                              </span>
                            </label>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>

                  {can("permission:assign") && (
                    <div className="sticky bottom-0 mt-5 flex items-center gap-3 border-t border-slate-200 bg-white pt-4">
                      <Button
                        onClick={() =>
                          savePermissions.mutate({
                            id: selected.id,
                            keys: [...draft],
                          })
                        }
                        disabled={!isDirty || savePermissions.isPending}
                      >
                        {savePermissions.isPending ? "Saving…" : "Save permissions"}
                      </Button>

                      {isDirty && (
                        <button
                          type="button"
                          onClick={() => setDraft(new Set(selected.permissions))}
                          className="text-sm font-medium text-slate-500 hover:text-slate-700"
                        >
                          Discard changes
                        </button>
                      )}

                      <span className="ml-auto text-xs text-slate-400">
                        {draft.size} selected
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminRoles;
