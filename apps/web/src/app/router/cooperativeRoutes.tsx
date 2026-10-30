import { Navigate, Route } from 'react-router-dom';
import { RequireCooperative } from '../../features/auth/components/RequireCooperative';
import { CooperativeDashboardPage } from '../../features/cooperatives/pages/CooperativeDashboardPage';
import { CooperativeBusGroupsPage } from '../../features/cooperatives/pages/CooperativeBusGroupsPage';
import { CooperativeConfigurationPage } from '../../features/cooperatives/pages/CooperativeConfigurationPage';
import { CooperativeLayout } from '../../features/cooperatives/components/CooperativeLayout';
import { CooperativeBusesPage } from '../../features/cooperatives/pages/CooperativeBusesPage';

export const cooperativeRoutes = (
  <Route
    path="/cooperativa"
    element={
      <RequireCooperative>
        <CooperativeLayout />
      </RequireCooperative>
    }
  >
    <Route index element={<Navigate to="panel" replace />} />
    <Route path="panel" element={<CooperativeDashboardPage />} />
    <Route path="configuracion" element={<CooperativeConfigurationPage />} />
    <Route path="grupos" element={<CooperativeBusGroupsPage />} />
    <Route path="buses" element={<CooperativeBusesPage />} />
  </Route>
);
