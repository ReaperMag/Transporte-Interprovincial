import { Navigate, Route } from 'react-router-dom';
import { RequireCooperative } from '../../features/auth/components/RequireCooperative';
import { CooperativeDashboardPage } from '../../features/cooperatives/pages/CooperativeDashboardPage';
import { CooperativeLayout } from '../../features/cooperatives/components/CooperativeLayout';

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
  </Route>
);
