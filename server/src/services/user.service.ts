/**
 * Staff account management.
 *
 * Every read here excludes passwordHash via an explicit select. Relying on
 * "remember not to send it" is how hashes end up in API responses.
 */

import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  buildPaginationMeta,
  getPagination,
  type PaginationMeta,
} from "../utils/pagination.js";
import { hashPassword } from "../utils/password.js";
import type {
  CreateUserInput,
  UpdateUserInput,
  UserListQuery,
} from "../validations/admin.validation.js";

/**
 * Safe projection. passwordHash is absent by construction, so no code path can
 * accidentally serialise it.
 */
const userSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, description: true } },
} satisfies Prisma.UserSelect;

const notDeleted = { deletedAt: null };

export const listUsers = async (
  query: UserListQuery
): Promise<{ users: unknown[]; meta: PaginationMeta }> => {
  const pagination = getPagination(query.page, query.limit);

  const where: Prisma.UserWhereInput = {
    ...notDeleted,
    ...(query.includeInactive ? {} : { isActive: true }),
    ...(query.roleId ? { roleId: query.roleId } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: pagination.skip,
      take: pagination.limit,
      orderBy: { createdAt: "desc" },
      select: userSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, meta: buildPaginationMeta(pagination, total) };
};

export const getUserById = async (id: string) => {
  const user = await prisma.user.findFirst({
    where: { id, ...notDeleted },
    select: userSelect,
  });

  if (!user) {
    throw AppError.notFound("User not found");
  }

  return user;
};

const assertRoleExists = async (roleId: string): Promise<void> => {
  const role = await prisma.role.findUnique({ where: { id: roleId } });

  if (!role) {
    throw AppError.badRequest("The selected role does not exist");
  }
};

export const createUser = async (input: CreateUserInput) => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict("An account with this email already exists");
  }

  await assertRoleExists(input.roleId);

  return prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      phone: input.phone,
      roleId: input.roleId,
      isActive: input.isActive ?? true,
    },
    select: userSelect,
  });
};

export const updateUser = async (id: string, input: UpdateUserInput) => {
  await getUserById(id);

  if (input.email) {
    const clash = await prisma.user.findFirst({
      where: { email: input.email, id: { not: id } },
      select: { id: true },
    });

    if (clash) {
      throw AppError.conflict("An account with this email already exists");
    }
  }

  if (input.roleId) {
    await assertRoleExists(input.roleId);
  }

  return prisma.user.update({ where: { id }, data: input, select: userSelect });
};

/**
 * Administrative password reset.
 *
 * Revokes every refresh token for the account: after an admin resets a
 * password, existing sessions must die. Leaving them alive would mean a
 * compromised account stays compromised despite the reset.
 */
export const resetPassword = async (
  id: string,
  newPassword: string
): Promise<void> => {
  await getUserById(id);

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};

/**
 * Deactivates a staff account.
 *
 * Soft delete, because User is referenced by orders and audit logs; a hard
 * delete would erase accountability for everything the person ever did.
 * Sessions are revoked so access ends immediately.
 */
export const deactivateUser = async (
  id: string,
  actorId?: string
): Promise<void> => {
  const user = await getUserById(id);

  // Prevents an administrator locking themselves out mid-session.
  if (id === actorId) {
    throw AppError.badRequest("You cannot deactivate your own account");
  }

  if (user.role.name === "SUPER_ADMIN") {
    const remaining = await prisma.user.count({
      where: { role: { name: "SUPER_ADMIN" }, isActive: true, ...notDeleted },
    });

    // Losing the last super admin makes the system unadministrable.
    if (remaining <= 1) {
      throw AppError.conflict("Cannot deactivate the only remaining super admin");
    }
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
};
