import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import {
  InstitutionalSidebar,
  type SidebarSection,
} from '../../cooperatives/components/InstitutionalSidebar';
import './AdminLayout.css';

const sections: readonly SidebarSection[] = [
  { to: '/admin/panel', label: 'Panel de resumen', icon: 'home' },
  { to: '/admin/cooperativas', label: 'Cooperativas', icon: 'groups' },
  { to: '/admin/provincias-cantones', label: 'Provincias y cantones', icon: 'map' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const isDashboard = location.pathname === '/admin/panel';
  const isGeographicCatalog = location.pathname === '/admin/provincias-cantones';

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
      <InstitutionalSidebar
        brandLabel="Identidad del sistema"
        cooperativeName="TRANSPORTE"
        panelLabel="Interprovincial"
        navigationLabel="Secciones del administrador"
        sections={sections}
        accountEmail={account?.email}
        accountRole="Administrador"
        fallbackInitials="AD"
      />

      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header__breadcrumb">
            <span>Administración</span>
            <b>/</b>
            <strong>
              {isDashboard
                ? 'Panel de resumen'
                : isGeographicCatalog
                  ? 'Provincias y cantones'
                  : 'Gestión de cooperativas'}
            </strong>
          </div>
          <div className="admin-header__account">
            <span className="admin-header__user">{account?.email}</span>
            <button
              className="admin-header__logout"
              onClick={() => void handleLogout()}
              type="button"
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        {logoutError && (
          <p className="admin-layout__error" role="alert">
            {logoutError}
          </p>
        )}
        <main className="admin-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
