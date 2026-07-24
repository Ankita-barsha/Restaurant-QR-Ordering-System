/**
 * Admin controllers: users, roles, permissions, customers, settings, reports
 * and the audit trail.
 */

import type { RequestHandler } from "express";

import * as auditService from "../services/audit.service.js";
import * as reportService from "../services/report.service.js";
import * as roleService from "../services/role.service.js";
import * as settingsService from "../services/settings.service.js";
import * as userService from "../services/user.service.js";
import type {
  AuditListQueryInput,
  CreateRoleInput,
  CreateUserInput,
  CustomerListQuery,
  ReportQuery,
  UpdateCustomerInput,
  UpdateRoleInput,
  UpdateSettingsInput,
  UpdateUserInput,
  UserListQuery,
} from "../validations/admin.validation.js";

type IdParams = { id: string };
type NoParams = Record<string, never>;

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const listUsers: RequestHandler = async (req, res) => {
  const { users, meta } = await userService.listUsers(
    req.validatedQuery as UserListQuery
  );

  res.json({ success: true, data: users, meta });
};

export const getUser: RequestHandler<IdParams> = async (req, res) => {
  res.json({ success: true, data: await userService.getUserById(req.params.id) });
};

export const createUser: RequestHandler<NoParams, unknown, CreateUserInput> = async (
  req,
  res
) => {
  const user = await userService.createUser(req.body);

  res.status(201).json({ success: true, message: "User created", data: user });
};

export const updateUser: RequestHandler<IdParams, unknown, UpdateUserInput> = async (
  req,
  res
) => {
  const user = await userService.updateUser(req.params.id, req.body);

  res.json({ success: true, message: "User updated", data: user });
};

export const resetUserPassword: RequestHandler<
  IdParams,
  unknown,
  { newPassword: string }
> = async (req, res) => {
  await userService.resetPassword(req.params.id, req.body.newPassword);

  res.json({
    success: true,
    message: "Password reset. All existing sessions for this user were revoked.",
  });
};

export const deactivateUser: RequestHandler<IdParams> = async (req, res) => {
  await userService.deactivateUser(req.params.id, req.user?.sub);

  res.json({ success: true, message: "User deactivated" });
};

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const listRoles: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await roleService.listRoles() });
};

export const getRole: RequestHandler<IdParams> = async (req, res) => {
  res.json({ success: true, data: await roleService.getRoleById(req.params.id) });
};

export const createRole: RequestHandler<NoParams, unknown, CreateRoleInput> = async (
  req,
  res
) => {
  const role = await roleService.createRole(req.body);

  res.status(201).json({ success: true, message: "Role created", data: role });
};

export const updateRole: RequestHandler<IdParams, unknown, UpdateRoleInput> = async (
  req,
  res
) => {
  const role = await roleService.updateRole(req.params.id, req.body);

  res.json({ success: true, message: "Role updated", data: role });
};

export const deleteRole: RequestHandler<IdParams> = async (req, res) => {
  await roleService.deleteRole(req.params.id);

  res.json({ success: true, message: "Role deleted" });
};

export const listPermissions: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await roleService.listPermissions() });
};

export const setRolePermissions: RequestHandler<
  IdParams,
  unknown,
  { permissionKeys: string[] }
> = async (req, res) => {
  const role = await roleService.setRolePermissions(
    req.params.id,
    req.body.permissionKeys
  );

  res.json({ success: true, message: "Permissions updated", data: role });
};

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const listCustomers: RequestHandler = async (req, res) => {
  const { customers, meta } = await settingsService.listCustomers(
    req.validatedQuery as CustomerListQuery
  );

  res.json({ success: true, data: customers, meta });
};

export const getCustomer: RequestHandler<IdParams> = async (req, res) => {
  res.json({
    success: true,
    data: await settingsService.getCustomerById(req.params.id),
  });
};

export const updateCustomer: RequestHandler<
  IdParams,
  unknown,
  UpdateCustomerInput
> = async (req, res) => {
  const customer = await settingsService.updateCustomer(req.params.id, req.body);

  res.json({ success: true, message: "Customer updated", data: customer });
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** PUBLIC — the customer app needs the name, currency and opening hours. */
export const getPublicSettings: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await settingsService.getPublicSettings() });
};

export const getSettings: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await settingsService.getSettings() });
};

export const updateSettings: RequestHandler<
  NoParams,
  unknown,
  UpdateSettingsInput
> = async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);

  res.json({ success: true, message: "Settings updated", data: settings });
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const dashboard: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await reportService.getDashboardSummary() });
};

export const salesReport: RequestHandler = async (req, res) => {
  const { from, to } = req.validatedQuery as ReportQuery;

  res.json({ success: true, data: await reportService.getSalesReport(from, to) });
};

export const topItems: RequestHandler = async (req, res) => {
  const { from, to } = req.validatedQuery as ReportQuery;

  res.json({ success: true, data: await reportService.getTopSellingItems(from, to) });
};

export const statusBreakdown: RequestHandler = async (req, res) => {
  const { from, to } = req.validatedQuery as ReportQuery;

  res.json({
    success: true,
    data: await reportService.getOrderStatusBreakdown(from, to),
  });
};

export const topCustomers: RequestHandler = async (_req, res) => {
  res.json({ success: true, data: await reportService.getTopCustomers() });
};

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export const listAuditLogs: RequestHandler = async (req, res) => {
  const { logs, meta } = await auditService.listAuditLogs(
    req.validatedQuery as AuditListQueryInput
  );

  res.json({ success: true, data: logs, meta });
};
