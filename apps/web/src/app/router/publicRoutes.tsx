import { Navigate, Route } from 'react-router-dom';
import { LoginPage } from '../../features/auth/pages/LoginPage';

export const publicRoutes = (
  <>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<LoginPage mode="preview" />} />
  </>
);
