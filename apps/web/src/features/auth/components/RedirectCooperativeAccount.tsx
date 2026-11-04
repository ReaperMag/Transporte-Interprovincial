import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function RedirectCooperativeAccount({ children }: { children: ReactNode }) {
  const { account, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return <p role="status">Verificando sesión...</p>;
  }

  if (account?.accountType === 'cooperative') {
    return <Navigate to="/cooperativa/panel" replace />;
  }

  return children;
}
