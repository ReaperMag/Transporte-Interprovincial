import { Navigate, Route } from 'react-router-dom';
import { RequireAdmin } from '../../features/auth/components/RequireAdmin';
import { AdminLayout } from '../../features/admin/components/AdminLayout';
import { CooperativesPage } from '../../features/admin/pages/CooperativesPage';

export const adminRoutes = (
  <Route
    path="/admin"
    element={
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    }
  >
    <Route index element={<Navigate to="cooperativas" replace />} />
    <Route path="cooperativas" element={<CooperativesPage />} />
  </Route>
);
