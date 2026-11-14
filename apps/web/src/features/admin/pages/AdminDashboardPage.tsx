import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/context/useAuth';
import { AdminApiError, getAdminSummary } from '../services/cooperatives.service';
import type { AdminSummary } from '../types/admin.types';
import './AdminDashboardPage.css';

type AdminIconName = 'building' | 'arrow' | 'activity' | 'shield';

function AdminIcon({ name, size = 22 }: { name: AdminIconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  const paths: Record<AdminIconName, ReactNode> = {
    building: (
      <>
        <path d="M3 21h18M5 21V5l7-3 7 3v16M9 9h1m4 0h1M9 13h1m4 0h1M10 21v-4h4v4" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    activity: <path d="M3 17h3l3-7 4 10 3-7h5" />,
    shield: (
      <>
        <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function formatToday(): string {
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function AdminDashboardPage() {
  const { account } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getAdminSummary(controller.signal)
      .then(setSummary)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof AdminApiError
              ? requestError.message
              : 'No se pudo cargar el resumen del administrador.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="admin-dashboard" aria-labelledby="admin-dashboard-title">
      <header className="admin-dashboard__heading">
        <div>
          <p className="admin-dashboard__eyebrow">Centro de administración</p>
          <h1 id="admin-dashboard-title">Panel de control</h1>
          <p>Resumen general del sistema y las cooperativas registradas.</p>
        </div>
        <span className="admin-dashboard__date">
          <AdminIcon name="activity" size={17} />
          {formatToday()}
        </span>
      </header>

      <section className="admin-dashboard__hero" aria-label="Cuenta administradora">
        <div className="admin-dashboard__hero-glow" aria-hidden="true" />
        <div className="admin-dashboard__hero-brand">
          <span className="admin-dashboard__hero-icon">
            <AdminIcon name="shield" size={42} />
          </span>
          <div className="admin-dashboard__hero-copy">
            <span className="admin-dashboard__hero-kicker">Administración del sistema</span>
            <h2>Bienvenido, administrador</h2>
            <p>Gestiona las organizaciones de transporte desde un solo lugar.</p>
            <div className="admin-dashboard__hero-facts">
              <span>
                Rol: <strong>Administrador principal</strong>
              </span>
              {account?.email && (
                <span>
                  Correo: <strong>{account.email}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="admin-dashboard__hero-art" aria-hidden="true">
          <svg viewBox="0 0 300 180" fill="none">
            <path
              d="M18 158h266M42 158V83h54v75m16 0V43h71v115m18 0V71h58v87"
              stroke="white"
              strokeOpacity=".62"
              strokeWidth="7"
              strokeLinejoin="round"
            />
            <path
              d="M55 100h12m-12 22h12m58-45h14m17 0h14m-45 24h14m17 0h14m-45 24h14m17 0h14m41-47h13m15 0h13m-41 24h13m15 0h13"
              stroke="white"
              strokeOpacity=".78"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </section>

      {loading && (
        <p className="admin-dashboard__notice" role="status">
          Cargando indicadores del sistema...
        </p>
      )}
      {error && (
        <p className="admin-dashboard__error" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <>
          <section className="admin-dashboard__metrics" aria-label="Cooperativas registradas">
            <Link
              to="/admin/cooperativas"
              className="admin-dashboard__metric admin-dashboard__metric--total"
            >
              <span className="admin-dashboard__metric-icon">
                <AdminIcon name="building" size={25} />
              </span>
              <span className="admin-dashboard__metric-info">
                <span className="admin-dashboard__metric-label">Cooperativas registradas</span>
                <strong>{summary.cooperatives}</strong>
                <small>Organizaciones en la plataforma</small>
              </span>
              <AdminIcon name="arrow" size={17} />
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
