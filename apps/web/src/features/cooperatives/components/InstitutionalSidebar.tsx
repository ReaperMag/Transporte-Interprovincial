import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import './InstitutionalSidebar.css';

export type SidebarIconName = 'home' | 'bus' | 'groups' | 'route' | 'users' | 'settings' | 'profile' | 'receipt' | 'ticket';

export interface SidebarSection {
  to: string;
  label: string;
  icon: SidebarIconName;
  end?: boolean;
}

interface InstitutionalSidebarProps {
  cooperativeName: string;
  logoUrl?: string | null;
  panelLabel: string;
  navigationLabel: string;
  sections: readonly SidebarSection[];
  accountEmail?: string | null;
  accountRole: string;
  fallbackInitials: string;
}

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const common = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const paths = {
    home: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3" /><path d="M5 10h14M8 19v2m8-2v2M8 14h2m4 0h2" /></>,
    groups: <><rect x="3" y="5" width="11" height="13" rx="2" /><path d="M3 10h11M6 18v2m5-2v2M16 8h2a3 3 0 0 1 3 3v7h-5m1-4h4" /></>,
    route: <><path d="M20 10c0 4-5 8-5 8s-5-4-5-8a5 5 0 1 1 10 0Z" /><circle cx="15" cy="10" r="1.5" /><path d="M3 20h4a3 3 0 0 0 0-6H5a2 2 0 0 1 0-4h2" /></>,
    users: <><circle cx="12" cy="7" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2M4 21h16" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M9.5 3.5 10 2h4l.5 1.5 2 1 1.6-.7 2.8 2.8-.7 1.6 1 2 1.5.5v4l-1.5.5-1 2 .7 1.6-2.8 2.8-1.6-.7-2 1L14 23h-4l-.5-1.5-2-1-1.6.7-2.8-2.8.7-1.6-1-2L1.3 14v-4l1.5-.5 1-2-.7-1.6 2.8-2.8 1.6.7 2-1Z" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h5" /></>,
    ticket: <><path d="M3 7h18v4a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM12 7v2m0 3v2m0 3v1" /></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export function InstitutionalSidebar({
  cooperativeName, logoUrl, panelLabel, navigationLabel, sections,
  accountEmail, accountRole, fallbackInitials,
}: InstitutionalSidebarProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);
  const initials = (accountEmail ?? '')
    .split('@')[0].split(/[._\s-]+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('') || fallbackInitials;

  return (
    <aside className="institutional-sidebar">
      <div className="institutional-sidebar__brand" aria-label="Identidad de la cooperativa">
        <span className="institutional-sidebar__brand-icon" aria-hidden="true">
          {showLogo ? <img src={logoUrl ?? undefined} alt="" onError={() => setFailedLogoUrl(logoUrl ?? null)} /> : '▰'}
        </span>
        <span className="institutional-sidebar__brand-copy">
          <strong>{cooperativeName}</strong>
          <small>{panelLabel}</small>
        </span>
      </div>
      <p className="institutional-sidebar__label">Área de trabajo</p>
      <nav className="institutional-sidebar__nav" aria-label={navigationLabel}>
        {sections.map(({ to, label, icon, end }) => (
          <NavLink
            key={to} to={to} end={end}
            className={({ isActive }) => `institutional-sidebar__link${isActive ? ' institutional-sidebar__link--active' : ''}`}
          >
            <span className="institutional-sidebar__link-icon"><SidebarIcon name={icon} /></span>
            <span className="institutional-sidebar__link-text">{label}</span>
            <span className="institutional-sidebar__link-chevron" aria-hidden="true">›</span>
          </NavLink>
        ))}
      </nav>
      <div className="institutional-sidebar__account">
        <span className="institutional-sidebar__account-avatar" aria-hidden="true">{initials}</span>
        <span className="institutional-sidebar__account-copy">
          <strong title={accountEmail ?? accountRole}>{accountEmail ?? accountRole}</strong>
          <small>{accountRole}</small>
        </span>
      </div>
    </aside>
  );
}
