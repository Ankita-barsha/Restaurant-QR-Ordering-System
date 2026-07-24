/**
 * Database seed.
 *
 * Creates the rows the application cannot function without: the permission
 * catalogue, the built-in roles, the first super admin, and the settings
 * singleton.
 *
 * IDEMPOTENT by design — every write is an upsert, so running it twice is
 * safe. A seed that only works against an empty database is useless the
 * moment you add a permission and need to sync it to an existing environment.
 */

import { config } from "../src/config/env.js";
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_METADATA,
  ROLES,
  type PermissionKey,
} from "../src/config/permissions.js";
import { prisma } from "../src/config/prisma.js";
import { hashPassword } from "../src/utils/password.js";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  [ROLES.SUPER_ADMIN]: "Full system access, including users, roles and audit logs",
  [ROLES.ADMIN]: "Runs the restaurant: menu, orders, tables and settings",
  [ROLES.KITCHEN]: "Kitchen display: view orders and advance their status",
  [ROLES.STAFF]: "Waiting staff: take and serve orders",
};

const seedPermissions = async (): Promise<void> => {
  const keys = Object.values(PERMISSIONS) as PermissionKey[];

  for (const key of keys) {
    const meta = PERMISSION_METADATA[key];

    await prisma.permission.upsert({
      where: { key },
      // Descriptions may change in code; keep the database in step.
      update: { group: meta.group, description: meta.description },
      create: { key, group: meta.group, description: meta.description },
    });
  }

  console.log(`  ✓ ${keys.length} permissions synced`);
};

const seedRoles = async (): Promise<void> => {
  for (const roleName of Object.values(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: {
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName],
        // Marks the role as built-in so the admin UI refuses to delete it.
        isSystem: true,
      },
    });

    const permissionKeys = DEFAULT_ROLE_PERMISSIONS[roleName] ?? [];

    const permissions = await prisma.permission.findMany({
      where: { key: { in: [...permissionKeys] } },
      select: { id: true },
    });

    // createMany + skipDuplicates rather than delete-then-insert: this must
    // not wipe permissions an administrator granted manually in the UI.
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    console.log(`  ✓ ${roleName} (${permissions.length} permissions)`);
  }
};

const seedSuperAdmin = async (): Promise<void> => {
  const email = config.seed.adminEmail;
  const password = config.seed.adminPassword;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env to seed the super admin"
    );
  }

  const role = await prisma.role.findUniqueOrThrow({
    where: { name: ROLES.SUPER_ADMIN },
  });

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // The password is NOT reset on re-run. Overwriting it would silently undo
    // a password the administrator had already changed.
    console.log(`  • super admin already exists (${email}), password unchanged`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      fullName: "Super Admin",
      roleId: role.id,
    },
  });

  console.log(`  ✓ super admin created (${email})`);
};

const seedSettings = async (): Promise<void> => {
  await prisma.restaurantSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", name: "My Restaurant", currency: "INR" },
  });

  console.log("  ✓ restaurant settings ready");
};

const main = async (): Promise<void> => {
  console.log("\nSeeding database...\n");

  await seedPermissions();
  await seedRoles();
  await seedSuperAdmin();
  await seedSettings();

  console.log("\nSeed complete.\n");
};

try {
  await main();
} catch (error) {
  console.error("\nSeed failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
