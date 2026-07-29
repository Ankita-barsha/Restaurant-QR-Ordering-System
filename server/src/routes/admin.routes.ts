/**
 * Admin and Super Admin routes.
 *
 * Every route names the capability it needs. Reading this file tells you
 * exactly who can reach what.
 */

import { Router } from "express";

import { PERMISSIONS } from "../config/permissions.js";
import * as admin from "../controllers/admin.controller.js";
import { audit } from "../middleware/audit.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validations/common.validation.js";
import {
  auditListQuerySchema,
  createRoleSchema,
  createUserSchema,
  customerListQuerySchema,
  reportQuerySchema,
  revenuePeriodSchema,
  resetPasswordSchema,
  setRolePermissionsSchema,
  topItemsQuerySchema,
  updateCustomerSchema,
  updateRoleSchema,
  updateSettingsSchema,
  updateUserSchema,
  userListQuerySchema,
} from "../validations/admin.validation.js";

const router = Router();

// Every route below requires a logged-in staff member.
router.use(authenticate);

// ---------------------------------------------------------------------------
// Users — Super Admin panel
// ---------------------------------------------------------------------------

router.get(
  "/users",
  authorize(PERMISSIONS.USER_READ),
  validate({ query: userListQuerySchema }),
  admin.listUsers
);

router.get(
  "/users/:id",
  authorize(PERMISSIONS.USER_READ),
  validate({ params: idParamSchema }),
  admin.getUser
);

router.post(
  "/users",
  authorize(PERMISSIONS.USER_CREATE),
  validate({ body: createUserSchema }),
  audit({ action: "user.create", entity: "User" }),
  admin.createUser
);

router.patch(
  "/users/:id",
  authorize(PERMISSIONS.USER_UPDATE),
  validate({ params: idParamSchema, body: updateUserSchema }),
  audit({ action: "user.update", entity: "User" }),
  admin.updateUser
);

router.post(
  "/users/:id/reset-password",
  authorize(PERMISSIONS.USER_UPDATE),
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  // The audit middleware redacts the password before it is stored.
  audit({ action: "user.resetPassword", entity: "User" }),
  admin.resetUserPassword
);

router.delete(
  "/users/:id",
  authorize(PERMISSIONS.USER_DELETE),
  validate({ params: idParamSchema }),
  audit({ action: "user.deactivate", entity: "User" }),
  admin.deactivateUser
);

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

router.get("/roles", authorize(PERMISSIONS.ROLE_READ), admin.listRoles);

router.get(
  "/roles/:id",
  authorize(PERMISSIONS.ROLE_READ),
  validate({ params: idParamSchema }),
  admin.getRole
);

router.post(
  "/roles",
  authorize(PERMISSIONS.ROLE_CREATE),
  validate({ body: createRoleSchema }),
  audit({ action: "role.create", entity: "Role" }),
  admin.createRole
);

router.patch(
  "/roles/:id",
  authorize(PERMISSIONS.ROLE_UPDATE),
  validate({ params: idParamSchema, body: updateRoleSchema }),
  audit({ action: "role.update", entity: "Role" }),
  admin.updateRole
);

router.delete(
  "/roles/:id",
  authorize(PERMISSIONS.ROLE_DELETE),
  validate({ params: idParamSchema }),
  audit({ action: "role.delete", entity: "Role" }),
  admin.deleteRole
);

router.get(
  "/permissions",
  authorize(PERMISSIONS.PERMISSION_READ),
  admin.listPermissions
);

/** Granting permissions is the most consequential admin action; always audited. */
router.put(
  "/roles/:id/permissions",
  authorize(PERMISSIONS.PERMISSION_ASSIGN),
  validate({ params: idParamSchema, body: setRolePermissionsSchema }),
  audit({ action: "role.setPermissions", entity: "Role" }),
  admin.setRolePermissions
);

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

router.get(
  "/customers",
  authorize(PERMISSIONS.CUSTOMER_READ),
  validate({ query: customerListQuerySchema }),
  admin.listCustomers
);

router.get(
  "/customers/:id",
  authorize(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParamSchema }),
  admin.getCustomer
);

router.patch(
  "/customers/:id",
  authorize(PERMISSIONS.CUSTOMER_UPDATE),
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  audit({ action: "customer.update", entity: "Customer" }),
  admin.updateCustomer
);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

router.get("/settings", authorize(PERMISSIONS.SETTINGS_READ), admin.getSettings);

router.patch(
  "/settings",
  authorize(PERMISSIONS.SETTINGS_UPDATE),
  validate({ body: updateSettingsSchema }),
  audit({ action: "settings.update", entity: "RestaurantSettings" }),
  admin.updateSettings
);

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

router.get("/reports/dashboard", authorize(PERMISSIONS.DASHBOARD_VIEW), admin.dashboard);

router.get(
  "/reports/sales",
  authorize(PERMISSIONS.REPORT_VIEW),
  validate({ query: reportQuerySchema }),
  admin.salesReport
);

router.get(
  "/reports/revenue",
  authorize(PERMISSIONS.REPORT_VIEW),
  validate({ query: revenuePeriodSchema }),
  admin.revenueBreakdown
);

router.get(
  "/reports/top-items",
  authorize(PERMISSIONS.REPORT_VIEW),
  validate({ query: topItemsQuerySchema }),
  admin.topItems
);

router.get(
  "/reports/order-status",
  authorize(PERMISSIONS.REPORT_VIEW),
  validate({ query: reportQuerySchema }),
  admin.statusBreakdown
);

router.get(
  "/reports/top-customers",
  authorize(PERMISSIONS.REPORT_VIEW),
  admin.topCustomers
);

// ---------------------------------------------------------------------------
// Audit trail — read-only by design; there is no write endpoint.
// ---------------------------------------------------------------------------

router.get(
  "/audit-logs",
  authorize(PERMISSIONS.AUDIT_LOG_READ),
  validate({ query: auditListQuerySchema }),
  admin.listAuditLogs
);

export default router;
