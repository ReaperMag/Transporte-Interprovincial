import { Navigate, Route } from 'react-router-dom';

import { LoginContainer } from '../../features/auth/components/LoginContainer';
import { SignupPage } from '../../features/auth/pages/SignupPage';
import { SeatPurchasePage } from '../../features/buses/pages/SeatPurchasePage';
import { CooperativePendingPage } from '../../features/auth/pages/CooperativePendingPage';

export const publicRoutes = (
  <>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginContainer />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/comprar-asientos" element={<SeatPurchasePage />} />
    <Route path="/cooperativa/pendiente" element={<CooperativePendingPage />} />
  </>
);
