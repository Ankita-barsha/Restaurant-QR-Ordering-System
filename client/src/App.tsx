/**
 * Routing.
 *
 * Two audiences share one app:
 *
 *   CUSTOMER — public. Reached by scanning a QR code. No login, no account.
 *   STAFF    — authenticated, and gated per route by PERMISSION so a chef,
 *              a waiter and an admin each see only what their role allows.
 *
 * The staff screens are loaded LAZILY, and that split matters more here than in
 * most apps. The customer app is opened on a phone, over mobile data, by
 * someone sitting at a table waiting to order — and statically importing the
 * admin pages meant every one of those diners downloaded the dashboard, the
 * reports, the user manager and the audit log before they could see the menu.
 * None of it is code they can even reach.
 *
 * Customer routes stay eagerly imported: they ARE the first screen, so
 * deferring them would only add a round trip before the menu appears.
 */

import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import MainLayout from "./layouts/MainLayout";
import Landing from "./pages/customer/Landing";
import { useAuth } from "./context/auth";
import CustomerCart from "./pages/customer/CustomerCart";
import CustomerMenu from "./pages/customer/CustomerMenu";
import Reserve from "./pages/customer/Reserve";
import ScanTable from "./pages/customer/ScanTable";
import TrackOrder from "./pages/customer/TrackOrder";
import { homeRouteFor } from "./lib/homeRoute";

// ---------------------------------------------------------------------------
// Staff bundle — fetched only once a staff route is actually visited.
// ---------------------------------------------------------------------------
const StaffLayout = lazy(() => import("./components/StaffLayout"));
const Login = lazy(() => import("./pages/staff/Login"));
const AdminDashboard = lazy(() => import("./pages/staff/AdminDashboard"));
const AdminMenu = lazy(() => import("./pages/staff/AdminMenu"));
const AdminAuditLogs = lazy(() => import("./pages/staff/AdminAuditLogs"));
const AdminContent = lazy(() => import("./pages/staff/AdminContent"));
const AdminPayments = lazy(() => import("./pages/staff/AdminPayments"));
const AdminReports = lazy(() => import("./pages/staff/AdminReports"));
const AdminReservations = lazy(() => import("./pages/staff/AdminReservations"));
const AdminRoles = lazy(() => import("./pages/staff/AdminRoles"));
const AdminSettings = lazy(() => import("./pages/staff/AdminSettings"));
const AdminTables = lazy(() => import("./pages/staff/AdminTables"));
const AdminUsers = lazy(() => import("./pages/staff/AdminUsers"));
const KitchenDisplay = lazy(() => import("./pages/staff/KitchenDisplay"));
const StaffOrders = lazy(() => import("./pages/staff/StaffOrders"));
const WaiterServe = lazy(() => import("./pages/staff/WaiterServe"));

/**
 * Landing route.
 *
 * A signed-in staff member goes to their role's home screen; anyone else is a
 * diner and starts at the menu.
 */
const RootRedirect = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return <Navigate to={user ? homeRouteFor(user) : "/menu"} replace />;
};

/**
 * Shown while a lazy chunk downloads.
 *
 * Deliberately plain: on the office Wi-Fi these chunks arrive in a few
 * milliseconds, and a spinner that flashes and vanishes reads as a glitch.
 */
const RouteFallback = () => (
  <div className="min-h-screen bg-obsidian" aria-busy="true" />
);

const App = () => (
  <BrowserRouter>
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        {/* ---- Customer (public) ---- */}
        {/* Standalone: the scan landing is a full-screen welcome with no chrome. */}
        <Route path="/t/:token" element={<ScanTable />} />

        {/* The rest share the branded navbar, which also shows the table number. */}
        <Route element={<MainLayout />}>
          <Route path="/welcome" element={<Landing />} />
          <Route path="/menu" element={<CustomerMenu />} />
          <Route path="/reserve" element={<Reserve />} />
          <Route path="/cart" element={<CustomerCart />} />
          <Route path="/track" element={<TrackOrder />} />
          <Route path="/track/:token" element={<TrackOrder />} />
        </Route>

        {/* ---- Staff ---- */}
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <StaffLayout />
            </ProtectedRoute>
          }
        >
          <Route
            path="/admin"
            element={
              <ProtectedRoute permission="dashboard:view">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute permission="report:view">
                <AdminReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/payments"
            element={
              <ProtectedRoute permission="report:view">
                <AdminPayments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/menu"
            element={
              <ProtectedRoute permission="food:read">
                <AdminMenu />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/content"
            element={
              <ProtectedRoute permission="content:update">
                <AdminContent />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tables"
            element={
              <ProtectedRoute permission="table:read">
                <AdminTables />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reservations"
            element={
              <ProtectedRoute permission="reservation:read">
                <AdminReservations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute permission="user:read">
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/roles"
            element={
              <ProtectedRoute permission="role:read">
                <AdminRoles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute permission="auditLog:read">
                <AdminAuditLogs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute permission="settings:read">
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kitchen"
            element={
              <ProtectedRoute permission="order:read">
                <KitchenDisplay />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute permission="order:read">
                <StaffOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/serve"
            element={
              <ProtectedRoute permission="order:updateStatus">
                <WaiterServe />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);

export default App;
