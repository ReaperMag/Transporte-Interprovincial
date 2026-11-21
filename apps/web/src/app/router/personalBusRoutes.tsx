import { Navigate, Route } from 'react-router-dom';
import { RequirePersonalBus } from '../../features/auth/components/RequirePersonalBus';
import { PersonalBusLayout } from '../../features/personal-bus/components/PersonalBusLayout';
import { PersonalBusTripPage } from '../../features/personal-bus/pages/PersonalBusTripPage';
import { PersonalBusTripsPage } from '../../features/personal-bus/pages/PersonalBusTripsPage';

export const personalBusRoutes = (
  <Route
    path="/personal-bus"
    element={
      <RequirePersonalBus>
        <PersonalBusLayout />
      </RequirePersonalBus>
    }
  >
    <Route index element={<Navigate to="viajes" replace />} />
    <Route path="viajes" element={<PersonalBusTripsPage />} />
    <Route path="viajes/:tripId" element={<PersonalBusTripPage />} />
  </Route>
);
