import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import { getAuthenticatedCooperativeProfile, type CooperativeProfile } from '../services/cooperative.service';
import './CooperativeLayout.css';
import './CooperativeTheme.css';

// The API validates saved colors; validate them again before injecting into CSS variables.
function validColor(value: string | null | undefined): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function readableTextColor(hex: string): string {
  const channels = [1, 3, 5].map((index) => {
    const channel = parseInt(hex.slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#14212b' : '#ffffff';
}

const sections = [
  ['/cooperativa/panel', 'Panel'],
  ['/cooperativa/buses', 'Buses'],
  ['/cooperativa/grupos', 'Grupos de buses'],
  ['/cooperativa/rutas', 'Rutas y frecuencias'],
  ['/cooperativa/oficinistas', 'Oficinistas'],
  ['/cooperativa/configuracion', 'Configuración'],
] as const;

export function CooperativeLayout() {
  const navigate = useNavigate();
  const { account, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [cooperativeProfile, setCooperativeProfile] = useState<CooperativeProfile | null>(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);

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

  const primary = validColor(cooperativeProfile?.primaryColor);
  const secondary = validColor(cooperativeProfile?.secondaryColor);
  const themeStyle = {
    ...(primary ? {
      '--coop-primary': primary,
      '--coop-on-primary': readableTextColor(primary),
      '--coop-brand-icon': primary,
      '--coop-brand-icon-text': readableTextColor(primary),
    } : {}),
    ...(secondary ? {
      '--coop-secondary': secondary,
      '--coop-on-secondary': readableTextColor(secondary),
    } : {}),
  } as CSSProperties;

  const logoUrl = cooperativeProfile?.logoUrl;
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
    <div className="cooperative-layout" style={themeStyle}>
      <aside className="cooperative-sidebar">
        <div className="cooperative-sidebar__brand">
          <span className="cooperative-sidebar__brand-icon" aria-hidden="true">
            {showLogo ? (
              <img
                src={logoUrl ?? undefined}
                alt=""
                onError={() => setFailedLogoUrl(logoUrl ?? null)}
              />
            ) : '▰'}
          </span>
          <strong>
            {cooperativeProfile?.name ?? 'TRANSPORTE'}
            <small>Panel de cooperativa</small>
          </strong>
        </div>
        <p className="cooperative-sidebar__label">Área de trabajo</p>
        <nav className="cooperative-sidebar__nav" aria-label="Secciones de la cooperativa">
          {sections.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `cooperative-sidebar__link${isActive ? ' cooperative-sidebar__link--active' : ''}`}>
              <span aria-hidden="true">{label === 'Panel' ? '⌂' : label === 'Configuración' ? '⚙' : label === 'Oficinistas' ? '♙' : '▦'}</span>{label}
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
        <main className="cooperative-layout__content"><Outlet context={{ onCooperativeProfileSaved: setCooperativeProfile }} /></main>
      </div>
    </div>
  );
}
