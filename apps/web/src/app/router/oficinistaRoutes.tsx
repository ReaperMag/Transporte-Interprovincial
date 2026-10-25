import { Navigate, Route } from 'react-router-dom';
import { OficinistaLayout } from '../../features/oficinista/components/OficinistaLayout';
import { OficinistaDashboardPage } from '../../features/oficinista/pages/OficinistaDashboardPage';
import { SeatSalePage } from '../../features/tickets/pages/SeatSalePage';

export const oficinistaRoutes = (
  <Route path="/oficinista" element={<OficinistaLayout />}>
    <Route index element={<Navigate to="panel" replace />} />
    <Route path="panel" element={<OficinistaDashboardPage />} />
    <Route path="vender-asientos/:tripId" element={<SeatSalePage />} />
  </Route>
);
