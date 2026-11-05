import { Navigate, Route } from 'react-router-dom';
import { OficinistaLayout } from '../../features/oficinista/components/OficinistaLayout';
import { OficinistaDashboardPage } from '../../features/oficinista/pages/OficinistaDashboardPage';
import { OficinistaPaymentsPage } from '../../features/oficinista/pages/OficinistaPaymentsPage';
import { OficinistaSalePage } from '../../features/oficinista/pages/OficinistaSalePage';
import { RequireOficinista } from '../../features/auth/components/RequireOficinista';

export const oficinistaRoutes = (
  <Route
    path="/oficinista"
    element={
      <RequireOficinista>
        <OficinistaLayout />
      </RequireOficinista>
    }
  >
    <Route index element={<Navigate to="panel" replace />} />
    <Route path="panel" element={<OficinistaDashboardPage />} />
    <Route path="pagos-pendientes" element={<OficinistaPaymentsPage />} />
    <Route path="ventas" element={<OficinistaSalePage />} />
    <Route path="vender-asientos/:tripId" element={<Navigate to="/oficinista/ventas" replace />} />
  </Route>
);
