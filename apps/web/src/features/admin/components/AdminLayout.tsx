import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { adminNavItems, adminSession, globalSettingsItems } from '../data/admin.mock';
import './AdminLayout.css';

export function AdminLayout() {
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(
    adminNavItems.findIndex((item) => location.pathname.startsWith(item.to)),
    0,
  );
  const activeSection = adminNavItems[activeIndex]?.label ?? 'Cooperativas';

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isSettingsOpen]);

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div className="admin-header__brand">
          <span className="admin-header__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="2" y="8" width="20" height="9" rx="2" fill="#60a5fa" />
              <path d="M6 8V6.5A1.5 1.5 0 0 1 7.5 5h9A1.5 1.5 0 0 1 18 6.5V8" stroke="#dbeafe" strokeWidth="1.5" />
              <circle cx="7" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <circle cx="17" cy="17.5" r="1.7" fill="#1e3a8a" stroke="#dbeafe" />
              <path d="M5 11h4M15 11h4" stroke="#eff6ff" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="admin-header__title">Panel de Administrador</h1>
        </div>

        <div className="admin-header__account">
          <p className="admin-header__user">
            {adminSession.displayName}: {adminSession.email}
          </p>
          <span className="admin-header__avatar" aria-hidden="true">
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
          <Link className="admin-header__logout" to="/login">
            Cerrar sesión
          </Link>
        </div>
      </header>

      <div className="admin-toolbar">
        <div className="admin-toolbar__settings" ref={settingsRef}>
          <button
            className="admin-toolbar__settings-button"
            type="button"
            aria-expanded={isSettingsOpen}
            aria-haspopup="menu"
            onClick={() => setIsSettingsOpen((previous) => !previous)}
          >
            Configuración Global
            <span aria-hidden="true">▾</span>
          </button>

          {isSettingsOpen && (
            <ul className="admin-toolbar__menu" role="menu">
              {globalSettingsItems.map((item) => (
                <li key={item} role="none">
                  <button className="admin-toolbar__menu-item" type="button" role="menuitem">
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <nav className="admin-toolbar__nav" aria-label="Secciones del administrador">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                isActive ? 'admin-toolbar__link admin-toolbar__link--active' : 'admin-toolbar__link'
              }
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
          <p
            className="admin-toolbar__hint"
            style={{ gridColumn: activeIndex + 1 }}
          >
            Visibilidad Limitada: {activeSection}
          </p>
        </nav>
      </div>

      <main className="admin-layout__content">
        <Outlet />
      </main>
    </div>
  );
}
