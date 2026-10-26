import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/context/useAuth';
import './PassengerLayout.css';

export function PassengerLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setError(null);

    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setError('No se pudo cerrar la sesión. Inténtalo nuevamente.');
    }
  }

  return (
    <div className="passenger-layout">
      <aside className="passenger-layout__sidebar">
        <div className="passenger-layout__brand">
          <span>🚌</span>
          <div>
            <strong>Transporte</strong>
            <small>Panel del pasajero</small>
          </div>
        </div>

        <nav className="passenger-layout__nav" aria-label="Navegación del pasajero">
          <NavLink to="/pasajero" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Inicio
          </NavLink>
          <NavLink to="/pasajero/perfil" className={({ isActive }) => (isActive ? 'active' : '')}>
            Mi perfil
          </NavLink>

          <NavLink to="/pasajero/asientos" className={({ isActive }) => (isActive ? 'active' : '')}>
            Seleccionar asientos
          </NavLink>
        </nav>

        <div className="passenger-layout__footer">
          {error && <p role="alert">{error}</p>}
          <button type="button" onClick={() => void handleLogout()}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="passenger-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
