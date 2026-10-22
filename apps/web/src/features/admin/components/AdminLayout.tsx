import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import './AdminLayout.css';

export function AdminLayout() {
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
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header__brand">
          <span className="admin-header__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="2" y="8" width="20" height="9" rx="2" fill="#60a5fa" />
              <path d="M6 8V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V8" stroke="#dbeafe" strokeWidth="1.5" />
              <circle cx="7" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <circle cx="17" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <path d="M5 11h4M15 11h4" stroke="#eff6ff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="admin-header__title">Panel de Administrador</h1>
        </div>

        <div className="admin-header__account">
          <p className="admin-header__user">
            Administrador: {account?.email}
          </p>
          <span className="admin-header__avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M5.5 18.5c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <button className="admin-header__logout" onClick={() => void handleLogout()} type="button">
            Cerrar sesión
          </button>
        </div>
      </header>

      {logoutError && <p role="alert">{logoutError}</p>}

      <div className="admin-toolbar">
        <nav className="admin-toolbar__nav" aria-label="Secciones del administrador">
          <span className="admin-toolbar__link admin-toolbar__link--active">
            Gestión de cooperativas
          </span>
        </nav>
      </div>

      <main className="admin-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
