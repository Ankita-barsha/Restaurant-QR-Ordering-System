/**
 * The permission catalogue — the single source of truth for what this system
 * can authorise.
 *
 * Defined in code rather than only in the database so route definitions can
 * reference `PERMISSIONS.FOOD_UPDATE` and get a compile error on a typo.
 * A stringly-typed `authorize("food:updte")` would silently deny everyone.
 *
 * The seed script syncs these rows into the database, which is what the Super
 * Admin's Permission Management screen reads.
 */

export const PERMISSIONS = {
  // Dashboard & reporting
  DASHBOARD_VIEW: "dashboard:view",
  REPORT_VIEW: "report:view",

  // Menu
  CATEGORY_READ: "category:read",
  CATEGORY_CREATE: "category:create",
  CATEGORY_UPDATE: "category:update",
  CATEGORY_DELETE: "category:delete",

  FOOD_READ: "food:read",
  FOOD_CREATE: "food:create",
  FOOD_UPDATE: "food:update",
  FOOD_DELETE: "food:delete",

  // Orders
  ORDER_READ: "order:read",
  ORDER_CREATE: "order:create",
  ORDER_UPDATE_STATUS: "order:updateStatus",
  ORDER_CANCEL: "order:cancel",

  // Kitchen display
  KITCHEN_ACCESS: "kitchen:access",

  // Tables & QR
  TABLE_READ: "table:read",
  TABLE_CREATE: "table:create",
  TABLE_UPDATE: "table:update",
  TABLE_DELETE: "table:delete",
  QR_MANAGE: "qr:manage",

  // Reservations
  RESERVATION_READ: "reservation:read",
  RESERVATION_UPDATE: "reservation:update",

  // Customers
  CUSTOMER_READ: "customer:read",
  CUSTOMER_UPDATE: "customer:update",

  // Administration
  USER_READ: "user:read",
  USER_CREATE: "user:create",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",

  ROLE_READ: "role:read",
  ROLE_CREATE: "role:create",
  ROLE_UPDATE: "role:update",
  ROLE_DELETE: "role:delete",

  PERMISSION_READ: "permission:read",
  PERMISSION_ASSIGN: "permission:assign",

  AUDIT_LOG_READ: "auditLog:read",
  SETTINGS_READ: "settings:read",
  SETTINGS_UPDATE: "settings:update",

  // Content management — the copy on the public welcome page
  CONTENT_UPDATE: "content:update",

  // Curated customer testimonials
  REVIEW_READ: "review:read",
  REVIEW_CREATE: "review:create",
  REVIEW_UPDATE: "review:update",
  REVIEW_DELETE: "review:delete",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** UI grouping and human descriptions for the Permission Management screen. */
export const PERMISSION_METADATA: Record<
  PermissionKey,
  { group: string; description: string }
> = {
  [PERMISSIONS.DASHBOARD_VIEW]: { group: "Dashboard", description: "View the dashboard" },
  [PERMISSIONS.REPORT_VIEW]: { group: "Reports", description: "View reports and analytics" },

  [PERMISSIONS.CATEGORY_READ]: { group: "Categories", description: "View categories" },
  [PERMISSIONS.CATEGORY_CREATE]: { group: "Categories", description: "Create categories" },
  [PERMISSIONS.CATEGORY_UPDATE]: { group: "Categories", description: "Edit categories" },
  [PERMISSIONS.CATEGORY_DELETE]: { group: "Categories", description: "Delete categories" },

  [PERMISSIONS.FOOD_READ]: { group: "Menu", description: "View menu items" },
  [PERMISSIONS.FOOD_CREATE]: { group: "Menu", description: "Create menu items" },
  [PERMISSIONS.FOOD_UPDATE]: { group: "Menu", description: "Edit menu items" },
  [PERMISSIONS.FOOD_DELETE]: { group: "Menu", description: "Delete menu items" },

  [PERMISSIONS.ORDER_READ]: { group: "Orders", description: "View orders" },
  [PERMISSIONS.ORDER_CREATE]: { group: "Orders", description: "Create orders" },
  [PERMISSIONS.ORDER_UPDATE_STATUS]: { group: "Orders", description: "Change order status" },
  [PERMISSIONS.ORDER_CANCEL]: { group: "Orders", description: "Cancel orders" },

  [PERMISSIONS.KITCHEN_ACCESS]: { group: "Kitchen", description: "Access the kitchen display" },

  [PERMISSIONS.TABLE_READ]: { group: "Tables", description: "View tables" },
  [PERMISSIONS.TABLE_CREATE]: { group: "Tables", description: "Create tables" },
  [PERMISSIONS.TABLE_UPDATE]: { group: "Tables", description: "Edit tables" },
  [PERMISSIONS.TABLE_DELETE]: { group: "Tables", description: "Delete tables" },
  [PERMISSIONS.QR_MANAGE]: { group: "Tables", description: "Generate and rotate QR codes" },

  [PERMISSIONS.RESERVATION_READ]: { group: "Reservations", description: "View bookings" },
  [PERMISSIONS.RESERVATION_UPDATE]: { group: "Reservations", description: "Manage and seat bookings" },

  [PERMISSIONS.CUSTOMER_READ]: { group: "Customers", description: "View customers" },
  [PERMISSIONS.CUSTOMER_UPDATE]: { group: "Customers", description: "Edit customers" },

  [PERMISSIONS.USER_READ]: { group: "Users", description: "View staff accounts" },
  [PERMISSIONS.USER_CREATE]: { group: "Users", description: "Create staff accounts" },
  [PERMISSIONS.USER_UPDATE]: { group: "Users", description: "Edit staff accounts" },
  [PERMISSIONS.USER_DELETE]: { group: "Users", description: "Deactivate staff accounts" },

  [PERMISSIONS.ROLE_READ]: { group: "Roles", description: "View roles" },
  [PERMISSIONS.ROLE_CREATE]: { group: "Roles", description: "Create roles" },
  [PERMISSIONS.ROLE_UPDATE]: { group: "Roles", description: "Edit roles" },
  [PERMISSIONS.ROLE_DELETE]: { group: "Roles", description: "Delete roles" },

  [PERMISSIONS.PERMISSION_READ]: { group: "Permissions", description: "View permissions" },
  [PERMISSIONS.PERMISSION_ASSIGN]: { group: "Permissions", description: "Assign permissions to roles" },

  [PERMISSIONS.AUDIT_LOG_READ]: { group: "Audit", description: "View audit logs" },
  [PERMISSIONS.SETTINGS_READ]: { group: "Settings", description: "View restaurant settings" },
  [PERMISSIONS.SETTINGS_UPDATE]: { group: "Settings", description: "Edit restaurant settings" },

  [PERMISSIONS.CONTENT_UPDATE]: { group: "Content", description: "Edit the welcome page content" },

  [PERMISSIONS.REVIEW_READ]: { group: "Content", description: "View every review, including hidden ones" },
  [PERMISSIONS.REVIEW_CREATE]: { group: "Content", description: "Publish customer reviews" },
  [PERMISSIONS.REVIEW_UPDATE]: { group: "Content", description: "Edit and hide customer reviews" },
  [PERMISSIONS.REVIEW_DELETE]: { group: "Content", description: "Delete customer reviews" },
};

/** Built-in role names. Seeded with isSystem = true so they cannot be deleted. */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  KITCHEN: "KITCHEN",
  STAFF: "STAFF",
} as const;

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/**
 * Default permission grants per built-in role.
 *
 * SUPER_ADMIN is omitted deliberately: the authorize middleware short-circuits
 * for it, so it cannot be locked out by a bad grant.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,

  // Runs the restaurant day to day; cannot manage staff accounts, roles,
  // permissions or audit logs — those belong to the Super Admin panel.
  [ROLES.ADMIN]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.CATEGORY_CREATE,
    PERMISSIONS.CATEGORY_UPDATE,
    PERMISSIONS.CATEGORY_DELETE,
    PERMISSIONS.FOOD_READ,
    PERMISSIONS.FOOD_CREATE,
    PERMISSIONS.FOOD_UPDATE,
    PERMISSIONS.FOOD_DELETE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.ORDER_CANCEL,
    PERMISSIONS.TABLE_READ,
    PERMISSIONS.TABLE_CREATE,
    PERMISSIONS.TABLE_UPDATE,
    PERMISSIONS.TABLE_DELETE,
    PERMISSIONS.QR_MANAGE,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.RESERVATION_READ,
    PERMISSIONS.RESERVATION_UPDATE,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.SETTINGS_UPDATE,
    // The welcome page is marketing, which is the manager's job, not the
    // super admin's.
    PERMISSIONS.CONTENT_UPDATE,
    PERMISSIONS.REVIEW_READ,
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_UPDATE,
    PERMISSIONS.REVIEW_DELETE,
  ],

  // Kitchen display only: sees orders and advances their status.
  [ROLES.KITCHEN]: [
    PERMISSIONS.KITCHEN_ACCESS,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.FOOD_READ,
  ],

  // Waiting staff: takes and serves orders, cannot edit the menu or cancel.
  [ROLES.STAFF]: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_UPDATE_STATUS,
    PERMISSIONS.FOOD_READ,
    PERMISSIONS.CATEGORY_READ,
    PERMISSIONS.TABLE_READ,
    // Waiting staff greet and seat arrivals, so they need the day's bookings.
    PERMISSIONS.RESERVATION_READ,
    PERMISSIONS.RESERVATION_UPDATE,
  ],
};
