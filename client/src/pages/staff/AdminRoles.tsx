/**
 * Roles and permissions — Super Admin panel.
 *
 * The permission checklist is the screen that makes RBAC real: granting a
 * capability here takes effect with no code change and no redeploy, because
 * routes are gated on capabilities rather than role names.
 *
 * Saving replaces the whole set in one request, so a half-applied change is
 * not possible if the browser dies mid-edit.
 * Theme-aware styling ensures clear contrast in both Dark and Light modes.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Card, ErrorBox, Spinner } from "../../components/ui";
import { useAuth } from "../../context/auth";
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

const inputClass =
  "w-full rounded-lg border border-smoke bg-graphite px-3 py-2 text-sm text-ivory placeholder:text-ivory-faint outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20";

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

  const [draftRoleId, setDraftRoleId] = useState<string | null>(null);

  if (draftRoleId !== selectedId) {
    setDraftRoleId(selectedId);
    setDraft(new Set(selected?.permissions ?? []));
  }

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

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  const isEditable = selected !== null && selected.name !== "SUPER_ADMIN";

  const isDirty =
    selected !== null &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((key) => !draft.has(key)));

  const mutationError =
    createRole.error ?? savePermissions.error ?? deleteRole.error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ivory font-display">Roles &amp; Permissions</h1>
          <p className="text-sm text-ivory-dim mt-0.5">Role capability matrix and access control policies.</p>
        </div>

        {can("role:create") && (
          <Button onClick={() => setShowForm((previous) => !previous)} className="font-bold uppercase tracking-wider text-xs">
            {showForm ? "Close" : "+ New role"}
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
              createRole.mutate({
                name: String(form.get("name")),
                description: String(form.get("description") || "") || undefined,
              });
            }}
            className="grid gap-3.5 sm:grid-cols-2"
          >
            <input
              name="name"
              required
              placeholder="SHIFT_MANAGER"
              className={`${inputClass} uppercase`}
            />
            <input
              name="description"
              placeholder="Role description"
              className={inputClass}
            />
            <p className="text-xs text-ivory-faint sm:col-span-2">
              Use UPPER_SNAKE_CASE. The name is an identifier, so it cannot be
              changed later for built-in roles.
            </p>
            <Button type="submit" disabled={createRole.isPending} className="sm:col-span-2 font-bold uppercase tracking-wider">
              {createRole.isPending ? "Creating…" : "Create role"}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="grid h-fit gap-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedId(role.id)}
              className={`rounded-xl border p-3.5 text-left transition ${
                selectedId === role.id
                  ? "border-gold bg-gold/15 shadow-sm"
                  : "border-smoke bg-charcoal hover:bg-graphite"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ivory text-base">{role.name}</span>
                {role.isSystem && (
                  <span className="rounded-full bg-graphite border border-smoke px-2 py-0.5 text-[10px] font-bold uppercase text-gold">
                    built-in
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-ivory-dim">
                {role.userCount} user(s) · {role.permissions.length} permission(s)
              </p>
            </button>
          ))}
        </div>

        <Card className="bg-charcoal border border-smoke">
          {!selected ? (
            <p className="py-12 text-center text-sm text-ivory-dim">
              Choose a role to view and edit its permissions.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-smoke pb-4">
                <div>
                  <h2 className="text-xl font-bold text-ivory font-display">{selected.name}</h2>
                  {selected.description && (
                    <p className="text-sm text-ivory-dim mt-0.5">{selected.description}</p>
                  )}
                </div>

                {can("role:delete") && !selected.isSystem && (
                  <Button
                    variant="danger"
                    onClick={() => deleteRole.mutate(selected.id)}
                    disabled={deleteRole.isPending || selected.userCount > 0}
                    className="font-bold text-xs"
                  >
                    {selected.userCount > 0
                      ? `In use by ${selected.userCount}`
                      : "Delete role"}
                  </Button>
                )}
              </div>

              {!isEditable ? (
                <div className="mt-4 rounded-xl bg-gold/15 border border-gold/30 p-4 text-sm text-gold font-medium">
                  The super admin always has full access. Its permissions are not
                  editable, so no configuration mistake can lock every administrator
                  out of the system.
                </div>
              ) : (
                <>
                  <div className="mt-4 space-y-5">
                    {permissionsQuery.data?.map((group) => (
                      <section key={group.group}>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gold">
                          {group.group}
                        </h3>

                        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                          {group.permissions.map((permission) => (
                            <label
                              key={permission.id}
                              className="flex items-start gap-2.5 rounded-lg p-2 text-sm bg-graphite/40 border border-smoke/60 hover:border-gold/40 transition cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={draft.has(permission.key)}
                                onChange={() => toggle(permission.key)}
                                disabled={!can("permission:assign")}
                                className="mt-0.5 accent-gold"
                              />
                              <span>
                                <span className="text-ivory font-medium block">
                                  {permission.description ?? permission.key}
                                </span>
                                <code className="text-[11px] text-gold/80 font-mono">
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
                    <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-smoke bg-charcoal pt-4">
                      <Button
                        onClick={() =>
                          savePermissions.mutate({
                            id: selected.id,
                            keys: [...draft],
                          })
                        }
                        disabled={!isDirty || savePermissions.isPending}
                        className="font-bold uppercase tracking-wider text-xs"
                      >
                        {savePermissions.isPending ? "Saving…" : "Save permissions"}
                      </Button>

                      {isDirty && (
                        <button
                          type="button"
                          onClick={() => setDraft(new Set(selected.permissions))}
                          className="text-sm font-medium text-ivory-dim hover:text-gold"
                        >
                          Discard changes
                        </button>
                      )}

                      <span className="ml-auto text-xs font-mono text-gold font-bold">
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
