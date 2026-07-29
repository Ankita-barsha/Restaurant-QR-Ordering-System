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
import { useLiveOrders, useSocketStatus } from "../hooks/useLiveOrders";
import NotificationBell from "./NotificationBell";

interface NavItem {
  to: string;
  label: string;
  /** Permission required to see the link; omitted means "any signed-in user". */
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
];

/**
 * Some roles are deliberately single-purpose.
 *
 * A chef works only the kitchen display; a waiter works only the serving
 * screen. Showing them the rest would be noise on a device used at speed
 * during service. This narrows what each sees in the nav — it is not a
 * security boundary, which the API enforces separately on every route.
 */
const ROLE_NAV_LOCK: Record<string, string[]> = {
  KITCHEN: ["/kitchen"],
  STAFF: ["/serve"],
};

/**
 * Scoped light-to-dark remapping.
 *
 * The staff screens were written against a light palette. Rather than
 * rewriting ten files of Tailwind classes — and risking a missed one showing
 * as a white block on black — the handful of light tokens they use are
 * remapped here. Colour stays in one place and each screen's markup stays
 * readable.
 */
const DARK_OVERRIDES = [
  "[&_.bg-white]:!bg-charcoal",
  "[&_.bg-slate-50]:!bg-graphite",
  "[&_.bg-slate-100]:!bg-graphite",
  "[&_.border-slate-100]:!border-smoke",
  "[&_.border-slate-200]:!border-smoke",
  "[&_.border-slate-300]:!border-smoke",
  "[&_.divide-slate-100]:!divide-smoke",
  "[&_.text-slate-900]:!text-ivory",
  "[&_.text-slate-800]:!text-ivory",
  "[&_.text-slate-700]:!text-ivory-dim",
  "[&_.text-slate-600]:!text-ivory-dim",
  "[&_.text-slate-500]:!text-ivory-faint",
  "[&_.text-slate-400]:!text-ivory-faint",
  "[&_input]:!bg-graphite",
  "[&_input]:!text-ivory",
  "[&_select]:!bg-graphite",
  "[&_select]:!text-ivory",
  "[&_textarea]:!bg-graphite",
  "[&_textarea]:!text-ivory",
].join(" ");

const StaffLayout = () => {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const connected = useSocketStatus();

  // Mounted once at the shell, so every staff screen shares one subscription.
  useLiveOrders();

  // A single-purpose role sees only its own screen; everyone else sees every
  // nav item their permissions allow.
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
    <div className="min-h-screen bg-obsidian">
      {/**
       * Two rows on a phone, one on a laptop.
       *
       * Seven things shared a single flex row — wordmark, nav, bell, live
       * badge, name, role, sign-out — and below about 700px they simply ran
       * out of width: the nav lost its scroll room, the wordmark truncated to
       * nothing and "Sign out" was pushed off the right edge. Splitting the
       * identity strip from the navigation gives the nav the FULL width to
       * scroll in, which is what it needs on the device it is most used on.
       */}
      <header className="sticky top-0 z-40 border-b border-smoke bg-obsidian/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5 sm:py-3 lg:flex-nowrap lg:gap-5">
          <span className="font-display shrink-0 text-lg tracking-wide text-ivory sm:text-xl">
            Bite me Bistro
          </span>

          {/* Pushed to the far right of row one on small screens; inline from
              lg. `order` keeps the DOM order sensible for screen readers. */}
          <div className="ml-auto flex shrink-0 items-center gap-3 lg:order-last lg:ml-0">
            <NotificationBell />

            <span
              className={`flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] ${
                connected ? "text-gold" : "text-ember"
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
              className="flex min-h-11 shrink-0 items-center text-[10px] uppercase tracking-[0.18em] text-ivory-faint transition-colors hover:text-gold"
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
                      ? "bg-gold/10 text-gold"
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
        className={`mx-auto max-w-[1600px] px-3 py-5 sm:px-5 sm:py-6 ${DARK_OVERRIDES}`}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default StaffLayout;
