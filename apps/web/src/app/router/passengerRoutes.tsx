import { Route } from 'react-router-dom';

import { RequirePassenger } from '../../features/auth/components/RequirePassenger';
import { PassengerLayout } from '../../shared/layouts/PassengerLayout';
import { PassengerDashboardPage } from '../../features/passengers/pages/PassengerDashboardPage';
import { PassengerProfilePage } from '../../features/passengers/pages/PassengerProfilePage';
import { PassengerTripSearchPage } from '../../features/passengers/pages/PassengerTripSearchPage';
import { SeatPurchasePage } from '../../features/buses/pages/SeatPurchasePage';
import { PassengerTripSeatsPage } from '../../features/passengers/pages/PassengerTripSeatsPage';
export const passengerRoutes = (
  <Route
    path="/pasajero"
    element={
      <RequirePassenger>
        <PassengerLayout />
      </RequirePassenger>
    }
  >
    <Route index element={<PassengerDashboardPage />} />
    <Route path="perfil" element={<PassengerProfilePage />} />
    <Route path="viajes" element={<PassengerTripSearchPage />} />
    <Route path="viajes/:tripId/asientos" element={<PassengerTripSeatsPage />} />
    <Route path="asientos" element={<SeatPurchasePage />} />
  </Route>
);
