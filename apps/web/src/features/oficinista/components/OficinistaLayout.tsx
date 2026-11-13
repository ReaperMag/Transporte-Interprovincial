import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import { cooperativeThemeStyle } from '../../cooperatives/utils/branding';
import { InstitutionalSidebar, type SidebarSection } from '../../cooperatives/components/InstitutionalSidebar';
import { getOficinistaInfo } from '../services/oficinista.service';
import type { OficinistaInfo } from '../types/oficinista.types';
import './OficinistaLayout.css';

const sections: readonly SidebarSection[] = [
  { to: '/oficinista/panel', label: 'Mi perfil', icon: 'profile', end: true },
  { to: '/oficinista/pagos-pendientes', label: 'Comprobantes', icon: 'receipt', end: true },
  { to: '/oficinista/ventas', label: 'Vender boleto', icon: 'ticket', end: true },
];

export function OficinistaLayout() {
  const navigate = useNavigate();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [profile, setProfile] = useState<OficinistaInfo | null>(null);

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
      <InstitutionalSidebar
        cooperativeName={profile?.cooperativeName ?? 'TRANSPORTE'}
        logoUrl={profile?.cooperativeLogoUrl}
        panelLabel="Panel de oficinista"
        navigationLabel="Secciones del oficinista"
        sections={sections}
        accountEmail={account?.email}
        accountRole="Personal de oficina"
        fallbackInitials="OF"
      />
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
