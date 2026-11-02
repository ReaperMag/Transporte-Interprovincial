import { Route } from 'react-router-dom';

import { RequirePassenger } from '../../features/auth/components/RequirePassenger';
import { PassengerLayout } from '../../shared/layouts/PassengerLayout';
import { PassengerDashboardPage } from '../../features/passengers/pages/PassengerDashboardPage';
import { PassengerProfilePage } from '../../features/passengers/pages/PassengerProfilePage';
import { PassengerTripSearchPage } from '../../features/passengers/pages/PassengerTripSearchPage';
import { PassengerTripSeatsPage } from '../../features/passengers/pages/PassengerTripSeatsPage';
import { PassengerReservationsPage } from '../../features/passengers/pages/PassengerReservationsPage';
import { SeatPurchasePage } from '../../features/buses/pages/SeatPurchasePage';

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
    <Route path="reservas" element={<PassengerReservationsPage />} />
    <Route path="asientos" element={<SeatPurchasePage />} />
  </Route>
);
