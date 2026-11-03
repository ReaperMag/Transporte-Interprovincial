import { Navigate, Route } from 'react-router-dom';

import { LoginContainer } from '../../features/auth/components/LoginContainer';
import { RequirePassenger } from '../../features/auth/components/RequirePassenger';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { SignupPage } from '../../features/auth/pages/SignupPage';
import { VerifyEmailPage } from '../../features/auth/pages/VerifyEmailPage';
import { SeatPurchasePage } from '../../features/buses/pages/SeatPurchasePage';

export const publicRoutes = (
  <>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginContainer />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/verificar-correo" element={<VerifyEmailPage />} />
    <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
    <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
    <Route
      path="/comprar-asientos"
      element={
        <RequirePassenger>
          <SeatPurchasePage />
        </RequirePassenger>
      }
    />
  </>
);
