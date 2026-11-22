import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import { cooperativeThemeStyle } from '../../cooperatives/utils/branding';
import {
  InstitutionalSidebar,
  type SidebarSection,
} from '../../cooperatives/components/InstitutionalSidebar';
import { getPersonalBusProfile } from '../services/personalBus.service';
import type { PersonalBusProfile } from '../types/personalBus.types';
import '../../oficinista/components/OficinistaLayout.css';

const sections: readonly SidebarSection[] = [
  { to: '/personal-bus/viajes', label: 'Mis viajes', icon: 'route' },
  { to: '/personal-bus/historial', label: 'Historial del bus', icon: 'receipt', end: true },
];

export function PersonalBusLayout() {
  const navigate = useNavigate();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PersonalBusProfile | null>(null);

  useEffect(() => {
    let active = true;
    void getPersonalBusProfile()
      .then((result) => {
        if (active) setProfile(result);
      })
      .catch(() => {
        /* Se mantiene el tema por defecto si no carga el perfil. */
      });
    return () => {
      active = false;
    };
  }, [account?.accountId]);

  const themeStyle = cooperativeThemeStyle(
    profile?.cooperativePrimaryColor,
    profile?.cooperativeSecondaryColor,
  );

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
      navigate('/', { replace: true });
    } catch {
      setLogoutError('No fue posible cerrar sesión. Inténtalo nuevamente.');
    }
  };

  return (
    <div className="oficinista-layout" style={themeStyle}>
      <InstitutionalSidebar
        cooperativeName={profile?.cooperativeName ?? 'TRANSPORTE'}
        logoUrl={profile?.cooperativeLogoUrl}
        panelLabel="Panel del personal del bus"
        navigationLabel="Secciones del personal del bus"
        sections={sections}
        accountEmail={account?.email}
        accountRole={profile?.position === 'controller' ? 'Controlador' : 'Conductor'}
        fallbackInitials="PB"
      />
      <div className="oficinista-main">
        <header className="oficinista-header">
          <div className="oficinista-header__breadcrumb">
            <span>Área de trabajo</span>
            <b>/</b>
            <strong>
              {profile?.assignedBus ? `Bus ${profile.assignedBus.number}` : 'Personal del bus'}
            </strong>
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
