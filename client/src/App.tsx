/**
 * Routing.
 *
 * Two audiences share one app:
 *
 *   CUSTOMER — public. Reached by scanning a QR code. No login, no account.
 *   STAFF    — authenticated, and gated per route by PERMISSION so a chef,
 *              a waiter and an admin each see only what their role allows.
 */

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import ProtectedRoute from "./components/ProtectedRoute";
import StaffLayout from "./components/StaffLayout";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import { useAuth } from "./context/AuthContext";
import CustomerCart from "./pages/customer/CustomerCart";
import CustomerMenu from "./pages/customer/CustomerMenu";
import ScanTable from "./pages/customer/ScanTable";
import TrackOrder from "./pages/customer/TrackOrder";
import AdminDashboard from "./pages/staff/AdminDashboard";
import AdminMenu from "./pages/staff/AdminMenu";
import AdminAuditLogs from "./pages/staff/AdminAuditLogs";
import AdminRoles from "./pages/staff/AdminRoles";
import AdminSettings from "./pages/staff/AdminSettings";
import AdminTables from "./pages/staff/AdminTables";
import AdminUsers from "./pages/staff/AdminUsers";
import KitchenDisplay from "./pages/staff/KitchenDisplay";
import Login, { homeRouteFor } from "./pages/staff/Login";
import StaffOrders from "./pages/staff/StaffOrders";

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

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      {/* ---- Customer (public) ---- */}
      {/* Standalone: the scan landing is a full-screen welcome with no chrome. */}
      <Route path="/t/:token" element={<ScanTable />} />

      {/* The rest share the branded navbar, which also shows the table number. */}
      <Route element={<MainLayout />}>
        <Route path="/welcome" element={<Home />} />
        <Route path="/menu" element={<CustomerMenu />} />
        <Route path="/cart" element={<CustomerCart />} />
        <Route path="/track" element={<TrackOrder />} />
        <Route path="/track/:orderNumber" element={<TrackOrder />} />
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
          path="/admin/menu"
          element={
            <ProtectedRoute permission="food:read">
              <AdminMenu />
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
