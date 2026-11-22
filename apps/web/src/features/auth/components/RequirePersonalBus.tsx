import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function RequirePersonalBus({ children }: { children: ReactNode }) {
  const { account, isCheckingSession } = useAuth();

  if (isCheckingSession) {
    return <p role="status">Verificando sesión...</p>;
  }

  if (!account) {
    return <Navigate to="/" replace />;
  }

  if (account.accountType === 'super_admin') {
    return <Navigate to="/admin/cooperativas" replace />;
  }

  if (account.accountType === 'cooperative') {
    return <Navigate to="/cooperativa/panel" replace />;
  }

  if (account.accountType === 'oficinista') {
    return <Navigate to="/oficinista/panel" replace />;
  }

  return account.accountType === 'personal_bus' ? children : <Navigate to="/pasajero" replace />;
}
