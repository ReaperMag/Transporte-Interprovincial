import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import { cooperativeThemeStyle } from '../../cooperatives/utils/branding';
import { getOficinistaInfo } from '../services/oficinista.service';
import type { OficinistaInfo } from '../types/oficinista.types';
import './OficinistaLayout.css';

const sections = [
  ['/oficinista/panel', 'Mi perfil', '♙'],
  ['/oficinista/pagos-pendientes', 'Comprobantes', '▤'],
  ['/oficinista/ventas', 'Vender boleto', '＋'],
] as const;

export function OficinistaLayout() {
  const navigate = useNavigate();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [profile, setProfile] = useState<OficinistaInfo | null>(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getOficinistaInfo()
      .then((result) => { if (active) setProfile(result); })
      .catch(() => { /* Preserve the default theme if the profile cannot be loaded. */ });
    return () => { active = false; };
  }, [account?.accountId]);

  const themeStyle = cooperativeThemeStyle(
    profile?.cooperativePrimaryColor,
    profile?.cooperativeSecondaryColor,
  );
  const logoUrl = profile?.cooperativeLogoUrl;
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);

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
    <div className="oficinista-layout" style={themeStyle}>
      <aside className="oficinista-sidebar">
        <div className="oficinista-sidebar__brand">
          <span className="oficinista-sidebar__brand-icon" aria-hidden="true">
            {showLogo ? (
              <img
                src={logoUrl ?? undefined}
                alt=""
                onError={() => setFailedLogoUrl(logoUrl ?? null)}
              />
            ) : '▰'}
          </span>
          <strong>
            {profile?.cooperativeName ?? 'TRANSPORTE'}<small>Panel de oficinista</small>
          </strong>
        </div>
        <p className="oficinista-sidebar__label">Área de trabajo</p>
        <nav className="oficinista-sidebar__nav" aria-label="Secciones del oficinista">
          {sections.map(([to, label, icon]) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `oficinista-sidebar__link${isActive ? ' oficinista-sidebar__link--active' : ''}`
              }
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="oficinista-sidebar__account">
          <span aria-hidden="true">{account?.email?.slice(0, 2).toUpperCase() ?? 'OF'}</span>
          <strong>
            {account?.email ?? 'Oficinista'}
            <small>Personal de oficina</small>
          </strong>
        </div>
      </aside>
      <div className="oficinista-main">
        <header className="oficinista-header">
          <div className="oficinista-header__breadcrumb">
            <span>Área de trabajo</span>
            <b>/</b>
            <strong>Panel de oficinista</strong>
          </div>
          <button
            className="oficinista-header__logout"
            onClick={() => void handleLogout()}
            type="button"
          >
            Cerrar sesión
          </button>
        </header>
        {logoutError && (
          <p className="oficinista-layout__error" role="alert">
            {logoutError}
          </p>
        )}
        <main className="oficinista-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
