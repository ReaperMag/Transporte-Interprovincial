import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { account, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return <p role="status">Verificando sesión...</p>;
  }

  if (account?.accountType !== 'super_admin') {
    return <Navigate to="/login" replace />;
  }

  return children;
}
