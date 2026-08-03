/**
 * Staff shell.
 *
 * Dark like the dining room, but denser and quieter: this is a working tool,
 * not a showpiece. Gold marks only the active nav item and the live badge.
 *
 * Navigation is filtered by PERMISSION, so a chef never sees a link they
 * would be refused at. Convenience, not security — the server enforces the
 * same permission on every route regardless of what is rendered.
 */

import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../context/auth";
import { useTheme } from "../context/theme";
import { useLiveOrders, useSocketStatus } from "../hooks/useLiveOrders";
import NotificationBell from "./NotificationBell";
import { MonkDeveloperBrand } from "./MonkDeveloperBrand";

import defaultLogo from "../assets/image/logo.png";
import { config } from "../config/env";
import { imageUrl } from "../lib/format";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../lib/api";
import type { ApiResponse, PublicSettings } from "../types/api";

interface NavItem {
  to: string;
  label: string;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin", label: "Dashboard", permission: "dashboard:view" },
  { to: "/admin/reports", label: "Reports", permission: "report:view" },
  { to: "/admin/payments", label: "Payments", permission: "report:view" },
  { to: "/kitchen", label: "Kitchen", permission: "kitchen:access" },
  { to: "/serve", label: "Serve", permission: "order:updateStatus" },
  { to: "/staff", label: "Orders", permission: "order:read" },
  { to: "/admin/reservations", label: "Bookings", permission: "reservation:read" },
  { to: "/admin/menu", label: "Menu", permission: "food:read" },
  { to: "/admin/content", label: "Content", permission: "content:update" },
  { to: "/admin/tables", label: "Tables", permission: "table:read" },
  { to: "/admin/users", label: "Staff", permission: "user:read" },
  { to: "/admin/roles", label: "Roles", permission: "role:read" },
  { to: "/admin/audit", label: "Audit", permission: "auditLog:read" },
  { to: "/admin/settings", label: "Settings", permission: "settings:read" },
  { to: "/admin/banking", label: "Banking", permission: "settings:read" },
];

const ROLE_NAV_LOCK: Record<string, string[]> = {
  KITCHEN: ["/kitchen"],
  STAFF: ["/serve"],
};

const StaffLayout = () => {
  const { user, logout, can } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const connected = useSocketStatus();

  const settingsQuery = useQuery({
    queryKey: ["settings", "public"],
    queryFn: async () => unwrap(await api.get<ApiResponse<PublicSettings>>("/settings")),
  });

  const restaurantName = settingsQuery.data?.name || "Bite me Bistro";
  const logoSrc = (settingsQuery.data?.logoUrl ? imageUrl(settingsQuery.data.logoUrl, config.apiUrl) : null) || defaultLogo;

  useLiveOrders();

  const roleLock = user ? ROLE_NAV_LOCK[user.role.name] : undefined;

  const visibleNav = NAV_ITEMS.filter((item) => {
    if (roleLock) return roleLock.includes(item.to);
    return !item.permission || can(item.permission);
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-obsidian">
      <header className="sticky top-0 z-40 border-b border-smoke bg-obsidian/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5 sm:py-3 lg:flex-nowrap lg:gap-5">
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src={logoSrc}
              alt={restaurantName}
              className="h-8 w-8 object-contain rounded-full border border-gold/40 p-0.5 bg-graphite"
            />
            <span className="font-display shrink-0 text-lg tracking-wide text-ivory sm:text-xl">
              {restaurantName}
            </span>
          </div>

          {/* Pushed to the far right of row one on small screens; inline from
              lg. `order` keeps the DOM order sensible for screen readers. */}
          <div className="ml-auto flex shrink-0 items-center gap-3 lg:order-last lg:ml-0">
            <button
              type="button"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-smoke bg-graphite/60 text-sm text-ivory transition-colors hover:border-gold/50 hover:text-slate"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <NotificationBell />

            <span
              className={`flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] ${
                connected ? "text-slate" : "text-ember"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "animate-pulse bg-gold" : "bg-ember"
                }`}
              />
              {/* The word is redundant next to the dot on a narrow screen. */}
              <span className="hidden xs:inline">
                {connected ? "Live" : "Offline"}
              </span>
            </span>

            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[13px] leading-tight text-ivory">
                {user?.fullName}
              </p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-ivory-faint">
                {user?.role.name}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              className="flex min-h-11 shrink-0 items-center text-[10px] uppercase tracking-[0.18em] text-ivory-faint transition-colors hover:text-slate"
            >
              Sign out
            </button>
          </div>

          {/* Full width on its own row below lg, so a long nav has somewhere
              to scroll. The negative margin lets the first and last items sit
              flush with the page gutter while still scrolling edge to edge. */}
          <nav className="-mx-3 flex w-[calc(100%+1.5rem)] gap-1 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:-mx-5 sm:w-[calc(100%+2.5rem)] sm:px-5 lg:mx-0 lg:w-auto lg:flex-1 lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
            {visibleNav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                className={({ isActive }) =>
                  `flex min-h-9 shrink-0 items-center rounded-lg px-3 text-[11px] uppercase tracking-[0.16em] transition-colors duration-300 ${
                    isActive
                      ? "bg-gold/10 text-slate"
                      : "text-ivory-faint hover:text-ivory"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main
        className="mx-auto max-w-[1600px] px-3 py-5 sm:px-5 sm:py-6 text-ivory"
      >
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-smoke/60 bg-graphite/40 py-4">
        <MonkDeveloperBrand variant="compact" className="justify-center w-full" />
      </footer>
    </div>
  );
};

export default StaffLayout;
