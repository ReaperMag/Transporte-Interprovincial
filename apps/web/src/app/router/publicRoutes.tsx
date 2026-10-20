import { Navigate, Route } from 'react-router-dom';

import { LoginContainer } from '../../features/auth/components/LoginContainer';
import { SignupPage } from '../../features/auth/pages/SignupPage';

export const publicRoutes = (
  <>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginContainer />} />
    <Route path="/signup" element={<SignupPage />} />
  </>
);
