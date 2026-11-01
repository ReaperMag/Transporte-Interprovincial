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
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__logo" aria-hidden="true">▰</span>
          <span><strong>TRANSPORTE</strong><small>Interprovincial</small></span>
        </div>
        <div className="admin-sidebar__section-label">Sistema</div>
        <nav className="admin-sidebar__nav" aria-label="Secciones del administrador">
          <span className="admin-sidebar__link admin-sidebar__link--active">
            <span aria-hidden="true">▦</span> Cooperativas
          </span>
        </nav>
        <div className="admin-sidebar__account">
          <span className="admin-sidebar__avatar" aria-hidden="true">AD</span>
          <span><strong>Administrador</strong><small>Acceso total</small></span>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__breadcrumb"><span>Inicio</span><b>/</b><strong>Gestión de Cooperativas</strong></div>
          <div className="admin-header__account">
            <span className="admin-header__user">{account?.email}</span>
            <button className="admin-header__logout" onClick={() => void handleLogout()} type="button">
              Cerrar sesión
            </button>
          </div>
        </header>
        {logoutError && <p className="admin-layout__error" role="alert">{logoutError}</p>}
        <main className="admin-layout__content"><Outlet /></main>
      </div>
    </div>
  );
}
