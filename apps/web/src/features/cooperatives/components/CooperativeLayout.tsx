import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import './CooperativeLayout.css';

export function CooperativeLayout() {
  const navigate = useNavigate();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('No fue posible cerrar sesión. Inténtalo nuevamente.');
    }
  };

  return (
    <div className="cooperative-layout">
      <header className="cooperative-header">
        <div className="cooperative-header__brand">
          <span className="cooperative-header__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="2" y="8" width="20" height="9" rx="2" fill="#60a5fa" />
              <path
                d="M6 8V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V8"
                stroke="#dbeafe"
                strokeWidth="1.5"
              />
              <circle cx="7" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <circle cx="17" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <path d="M5 11h4M15 11h4" stroke="#eff6ff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="cooperative-header__title">Panel de Cooperativa</h1>
        </div>

        <div className="cooperative-header__account">
          <p className="cooperative-header__user">Cuenta: {account?.email}</p>
          <button
            className="cooperative-header__logout"
            onClick={() => void handleLogout()}
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {logoutError && (
        <p className="cooperative-layout__error" role="alert">
          {logoutError}
        </p>
      )}

      <div className="cooperative-toolbar">
        <nav className="cooperative-toolbar__nav" aria-label="Secciones de la cooperativa">
          <NavLink
            className={({ isActive }) =>
              `cooperative-toolbar__link${isActive ? ' cooperative-toolbar__link--active' : ''}`
            }
            to="/cooperativa/panel"
          >
            Panel
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `cooperative-toolbar__link${isActive ? ' cooperative-toolbar__link--active' : ''}`
            }
            to="/cooperativa/configuracion"
          >
            Configuración
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `cooperative-toolbar__link${isActive ? ' cooperative-toolbar__link--active' : ''}`
            }
            to="/cooperativa/grupos"
          >
            Grupos
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `cooperative-toolbar__link${isActive ? ' cooperative-toolbar__link--active' : ''}`
            }
            to="/cooperativa/rutas"
          >
            Rutas y frecuencias
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `cooperative-toolbar__link${isActive ? ' cooperative-toolbar__link--active' : ''}`
            }
            to="/cooperativa/buses"
          >
            Buses
          </NavLink>
        </nav>
      </div>

      <main className="cooperative-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
