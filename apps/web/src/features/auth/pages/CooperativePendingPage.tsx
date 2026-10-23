import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

export function CooperativePendingPage() {
  const { account, isCheckingSession, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (isCheckingSession) {
    return <p role="status">Verificando sesión...</p>;
  }

  if (account?.accountType !== 'cooperative') {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    setError(null);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setError('No fue posible cerrar sesión. Inténtalo nuevamente.');
    }
  };

  return (
    <main>
      <section aria-labelledby="cooperative-pending-title">
        <h1 id="cooperative-pending-title">Cuenta de cooperativa</h1>
        <p>Sesión iniciada como {account?.email}.</p>
        <p>
          Tu cuenta ya está creada y vinculada a una cooperativa. El panel de
          gestión se habilitará en un próximo sprint.
        </p>
        {error && <p role="alert">{error}</p>}
        <button onClick={() => void handleLogout()} type="button">
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
