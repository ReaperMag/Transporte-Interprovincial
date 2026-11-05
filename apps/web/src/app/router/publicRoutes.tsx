import { Navigate, Route } from 'react-router-dom';

import { LoginContainer } from '../../features/auth/components/LoginContainer';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { SignupPage } from '../../features/auth/pages/SignupPage';
import { VerifyEmailPage } from '../../features/auth/pages/VerifyEmailPage';

export const publicRoutes = (
  <>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginContainer />} />
    <Route path="/signup" element={<SignupPage />} />
    <Route path="/verificar-correo" element={<VerifyEmailPage />} />
    <Route path="/recuperar-contrasena" element={<ForgotPasswordPage />} />
    <Route path="/restablecer-contrasena" element={<ResetPasswordPage />} />
    <Route path="/comprar-asientos" element={<Navigate to="/pasajero" replace />} />
  </>
);
