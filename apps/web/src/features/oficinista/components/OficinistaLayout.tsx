import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import './OficinistaLayout.css';

export function OficinistaLayout() {
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
    <div className="oficinista-layout">
      <header className="oficinista-header">
        <div className="oficinista-header__brand">
          <span className="oficinista-header__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="2" y="8" width="20" height="9" rx="2" fill="#60a5fa" />
              <path d="M6 8V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V8" stroke="#dbeafe" strokeWidth="1.5" />
              <circle cx="7" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <circle cx="17" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <path d="M5 11h4M15 11h4" stroke="#eff6ff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="oficinista-header__title">Panel Oficinista</h1>
        </div>

        <div className="oficinista-header__account">
          <p className="oficinista-header__user">Oficinista: {account?.email}</p>
          <span className="oficinista-header__avatar" aria-hidden="true">
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
          <button className="oficinista-header__logout" onClick={() => void handleLogout()} type="button">
            Cerrar sesión
          </button>
        </div>
      </header>

      {logoutError && <p role="alert">{logoutError}</p>}

      <div className="oficinista-toolbar">
        <nav className="oficinista-toolbar__nav" aria-label="Secciones del oficinista">
          <span className="oficinista-toolbar__link oficinista-toolbar__link--active">Venta de boletos</span>
        </nav>
      </div>

      <main className="oficinista-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
