import { Navigate, Route } from 'react-router-dom';
import { RequireAdmin } from '../../features/auth/components/RequireAdmin';
import { AdminLayout } from '../../features/admin/components/AdminLayout';
import { CooperativesPage } from '../../features/admin/pages/CooperativesPage';
import { AdminDashboardPage } from '../../features/admin/pages/AdminDashboardPage';
import { GeographicCatalogPage } from '../../features/admin/pages/GeographicCatalogPage';
import { VehicleCatalogPage } from '../../features/admin/pages/VehicleCatalogPage';

export const adminRoutes = (
  <Route
    path="/admin"
    element={
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    }
  >
    <Route index element={<Navigate to="panel" replace />} />
    <Route path="panel" element={<AdminDashboardPage />} />
    <Route path="cooperativas" element={<CooperativesPage />} />
    <Route path="provincias-cantones" element={<GeographicCatalogPage />} />
    <Route path="chasis-carrocerias" element={<VehicleCatalogPage />} />
  </Route>
);
