/**
 * Role and permission management — the Super Admin panel.
 *
 * System roles (isSystem = true) are protected from renaming and deletion.
 * Their names are referenced in code (SUPER_ADMIN short-circuits authorize),
 * so allowing a rename through the UI would silently break authorisation.
 */

import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type {
  CreateRoleInput,
  UpdateRoleInput,
} from "../validations/admin.validation.js";

const roleInclude = {
  permissions: { include: { permission: true } },
  _count: { select: { users: true } },
};

/** Flattens the join table into a plain list of permission keys. */
const toRoleView = (role: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { permission: { key: string; group: string } }[];
  _count: { users: number };
}) => ({
  id: role.id,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  userCount: role._count.users,
  permissions: role.permissions.map((entry) => entry.permission.key),
});

export const listRoles = async () => {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: roleInclude,
  });

  return roles.map(toRoleView);
};

export const getRoleById = async (id: string) => {
  const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });

  if (!role) {
    throw AppError.notFound("Role not found");
  }

  return toRoleView(role);
};

export const createRole = async (input: CreateRoleInput) => {
  const existing = await prisma.role.findUnique({
    where: { name: input.name },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict(`A role named ${input.name} already exists`);
  }

  const role = await prisma.role.create({
    // isSystem stays false: only the seed creates built-in roles.
    data: { name: input.name, description: input.description },
    include: roleInclude,
  });

  return toRoleView(role);
};

export const updateRole = async (id: string, input: UpdateRoleInput) => {
  const existing = await prisma.role.findUnique({ where: { id } });

  if (!existing) {
    throw AppError.notFound("Role not found");
  }

  // A system role's NAME is referenced in code; its description is free text.
  if (existing.isSystem && input.name && input.name !== existing.name) {
    throw AppError.forbidden("Built-in roles cannot be renamed");
  }

  if (input.name) {
    const clash = await prisma.role.findFirst({
      where: { name: input.name, id: { not: id } },
      select: { id: true },
    });

    if (clash) {
      throw AppError.conflict(`A role named ${input.name} already exists`);
    }
  }

  const role = await prisma.role.update({
    where: { id },
    data: input,
    include: roleInclude,
  });

  return toRoleView(role);
};

export const deleteRole = async (id: string): Promise<void> => {
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    throw AppError.notFound("Role not found");
  }

  if (role.isSystem) {
    throw AppError.forbidden("Built-in roles cannot be deleted");
  }

  // User.roleId is onDelete: Restrict, so this would fail at the database
  // anyway; checking here produces a message an administrator can act on.
  if (role._count.users > 0) {
    throw AppError.conflict(
      `Cannot delete: ${role._count.users} user(s) still have this role`
    );
  }

  await prisma.role.delete({ where: { id } });
};

/** The full catalogue, grouped for the Permission Management screen. */
export const listPermissions = async () => {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  const grouped = new Map<string, typeof permissions>();

  for (const permission of permissions) {
    const bucket = grouped.get(permission.group) ?? [];
    bucket.push(permission);
    grouped.set(permission.group, bucket);
  }

  return [...grouped.entries()].map(([group, items]) => ({ group, permissions: items }));
};

/**
 * Replaces a role's permissions with exactly the given set.
 *
 * Wholesale replacement rather than add/remove endpoints, because the admin
 * UI is a checklist: it knows the desired final state, and diffing it here
 * avoids a partially-applied change if the client crashes mid-update.
 */
export const setRolePermissions = async (roleId: string, permissionKeys: string[]) => {
  const role = await prisma.role.findUnique({ where: { id: roleId } });

  if (!role) {
    throw AppError.notFound("Role not found");
  }

  // SUPER_ADMIN bypasses permission checks entirely, so editing its list is
  // misleading — it would appear to restrict an account that stays unlimited.
  if (role.name === "SUPER_ADMIN") {
    throw AppError.forbidden(
      "The super admin role always has full access and cannot be edited"
    );
  }

  const permissions = await prisma.permission.findMany({
    where: { key: { in: permissionKeys } },
    select: { id: true, key: true },
  });

  // Reject unknown keys rather than silently ignoring them: a typo in the UI
  // must not look like a successful save.
  if (permissions.length !== new Set(permissionKeys).size) {
    const found = new Set(permissions.map((entry) => entry.key));
    const unknown = permissionKeys.filter((key) => !found.has(key));

    throw AppError.badRequest(`Unknown permission(s): ${unknown.join(", ")}`);
  }

  // Delete-then-insert inside one transaction, so the role is never left with
  // a partial permission set.
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      skipDuplicates: true,
    }),
  ]);

  return getRoleById(roleId);
};
