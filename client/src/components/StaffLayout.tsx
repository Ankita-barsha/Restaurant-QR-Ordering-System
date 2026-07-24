/**
 * Staff shell: navigation, live indicator and sign-out.
 *
 * Navigation entries are filtered by PERMISSION, so a chef never sees a link
 * they would be refused at. This is convenience, not security — the server
 * enforces the same permission on every route regardless of what is rendered.
 */

import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { useLiveOrders, useSocketStatus } from "../hooks/useLiveOrders";
import { ConnectionDot } from "./ui";

interface NavItem {
  to: string;
  label: string;
  /** Permission required to see the link; omitted means "any signed-in user". */
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: "Dashboard", permission: "dashboard:view" },
  { to: "/kitchen", label: "Kitchen", permission: "kitchen:access" },
  { to: "/staff", label: "Orders", permission: "order:read" },
  { to: "/admin/menu", label: "Menu", permission: "food:read" },
  { to: "/admin/tables", label: "Tables & QR", permission: "table:read" },
];

const StaffLayout = () => {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const connected = useSocketStatus();

  // Mounted once at the shell so every staff screen shares one subscription.
  useLiveOrders();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-black text-orange-600">QR Restaurant</span>

          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {NAV_ITEMS.filter((item) => !item.permission || can(item.permission)).map(
              (item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/admin"}
                  className={({ isActive }) =>
                    `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      isActive
                        ? "bg-orange-50 text-orange-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              )
            )}
          </nav>

          <ConnectionDot connected={connected} />

          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-slate-900">{user?.fullName}</p>
            <p className="text-xs text-slate-500">{user?.role.name}</p>
          </div>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default StaffLayout;
