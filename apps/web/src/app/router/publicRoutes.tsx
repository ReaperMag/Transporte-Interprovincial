import { Navigate, Route } from 'react-router-dom';

import { LoginContainer } from '../../features/auth/components/LoginContainer';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { SignupPage } from '../../features/auth/pages/SignupPage';
import { VerifyEmailPage } from '../../features/auth/pages/VerifyEmailPage';
import { PassengerDashboardPage } from '../../features/passengers/pages/PassengerDashboardPage';
import { PublicHomePage, PublicLayout } from '../../features/passengers/pages/PublicHomePage';
import { PublicTripSeatsPage } from '../../features/passengers/pages/PublicTripSeatsPage';
import './publicDashboard.css';

export const publicRoutes = (
  <>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<PublicHomePage />} />
      <Route
        path="/viajes"
        element={
          <div className="public-dashboard">
            <PassengerDashboardPage isPublic />
          </div>
        }
      />
      <Route path="/viajes/:tripId/asientos" element={<PublicTripSeatsPage />} />
    </Route>
    <Route path="/login" element={<LoginContainer />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/verificar-correo" element={<VerifyEmailPage />} />
    <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
    <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
    <Route path="/comprar-asientos" element={<Navigate to="/pasajero" replace />} />
  </>
);
