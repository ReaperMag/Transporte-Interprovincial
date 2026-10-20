import { Navigate, Route } from 'react-router-dom';

import { LoginPage } from '../../features/auth/pages/LoginPage';
import { SignupPage } from '../../features/auth/pages/SignupPage';
import { SeatPurchasePage } from '../../features/buses/pages/SeatPurchasePage';

export const publicRoutes = (
  <>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginPage mode="preview" />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/comprar-asientos" element={<SeatPurchasePage />} />
  </>
);
