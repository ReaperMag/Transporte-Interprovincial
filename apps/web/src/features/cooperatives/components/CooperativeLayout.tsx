import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import { getAuthenticatedCooperativeProfile, type CooperativeProfile } from '../services/cooperative.service';
import { cooperativeThemeStyle } from '../utils/branding';
import { InstitutionalSidebar, type SidebarSection } from './InstitutionalSidebar';
import './CooperativeLayout.css';
import './CooperativeTheme.css';

const sections: readonly SidebarSection[] = [
  { to: '/cooperativa/panel', label: 'Panel', icon: 'home' },
  { to: '/cooperativa/buses', label: 'Buses', icon: 'bus' },
  { to: '/cooperativa/grupos', label: 'Grupos de buses', icon: 'groups' },
  { to: '/cooperativa/tipos-asiento', label: 'Tipos de asiento', icon: 'bus' },
  { to: '/cooperativa/rutas', label: 'Rutas y frecuencias', icon: 'route' },
  { to: '/cooperativa/oficinistas', label: 'Oficinistas', icon: 'users' },
  { to: '/cooperativa/configuracion', label: 'Configuración', icon: 'settings' },
];


export function CooperativeLayout() {
  const navigate = useNavigate();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [cooperativeProfile, setCooperativeProfile] = useState<CooperativeProfile | null>(null);

  useEffect(() => {
    let active = true;
    void getAuthenticatedCooperativeProfile()
      .then((profile) => {
        if (active) setCooperativeProfile(profile);
      })
      .catch(() => {
        // If the profile is unavailable, preserve the original sidebar appearance.
      });
    return () => { active = false; };
  }, [account?.accountId]);

  const themeStyle = cooperativeThemeStyle(
    cooperativeProfile?.primaryColor,
    cooperativeProfile?.secondaryColor,
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
    <div className="cooperative-layout" style={themeStyle}>
      <InstitutionalSidebar
        cooperativeName={cooperativeProfile?.name ?? 'TRANSPORTE'}
        logoUrl={cooperativeProfile?.logoUrl}
        panelLabel="Panel de cooperativa"
        navigationLabel="Secciones de la cooperativa"
        sections={sections}
        accountEmail={account?.email}
        accountRole="Cooperativa"
        fallbackInitials="CO"
      />
      <div className="cooperative-main">
        <header className="cooperative-header">
          <div className="cooperative-header__breadcrumb"><span>Organización</span><b>/</b><strong>Panel de trabajo</strong></div>
          <button className="cooperative-header__logout" onClick={() => void handleLogout()} type="button">Cerrar sesión</button>
        </header>
        {logoutError && <p className="cooperative-layout__error" role="alert">{logoutError}</p>}
        <main className="cooperative-layout__content"><Outlet context={{ onCooperativeProfileSaved: setCooperativeProfile }} /></main>
      </div>
    </div>
  );
}
