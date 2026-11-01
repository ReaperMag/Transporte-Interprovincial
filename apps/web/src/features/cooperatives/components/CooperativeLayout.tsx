import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import './CooperativeLayout.css';
import './CooperativeTheme.css';

const sections = [
  ['/cooperativa/panel', 'Panel'],
  ['/cooperativa/buses', 'Buses'],
  ['/cooperativa/grupos', 'Grupos de buses'],
  ['/cooperativa/rutas', 'Rutas y frecuencias'],
  ['/cooperativa/configuracion', 'Configuración'],
] as const;

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
      <aside className="cooperative-sidebar">
        <div className="cooperative-sidebar__brand"><span aria-hidden="true">▰</span><strong>TRANSPORTE<small>Panel de cooperativa</small></strong></div>
        <p className="cooperative-sidebar__label">Área de trabajo</p>
        <nav className="cooperative-sidebar__nav" aria-label="Secciones de la cooperativa">
          {sections.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `cooperative-sidebar__link${isActive ? ' cooperative-sidebar__link--active' : ''}`}>
              <span aria-hidden="true">{label === 'Panel' ? '⌂' : label === 'Configuración' ? '⚙' : '▦'}</span>{label}
            </NavLink>
          ))}
        </nav>
        <div className="cooperative-sidebar__account"><span>AE</span><strong>{account?.email ?? 'Cooperativa'}<small>Cooperativa</small></strong></div>
      </aside>
      <div className="cooperative-main">
        <header className="cooperative-header">
          <div className="cooperative-header__breadcrumb"><span>Organización</span><b>/</b><strong>Panel de trabajo</strong></div>
          <button className="cooperative-header__logout" onClick={() => void handleLogout()} type="button">Cerrar sesión</button>
        </header>
        {logoutError && <p className="cooperative-layout__error" role="alert">{logoutError}</p>}
        <main className="cooperative-layout__content"><Outlet /></main>
      </div>
    </div>
  );
}
