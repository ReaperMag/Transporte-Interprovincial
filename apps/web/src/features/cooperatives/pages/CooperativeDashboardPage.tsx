import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  getAuthenticatedCooperativeProfile,
  getCooperativeRouteFrequencySummary,
  type CooperativeProfile,
  type CooperativeRouteFrequencyAssignment,
  type CooperativeRouteFrequencySummary,
} from '../services/cooperative.service';
import { getCooperativeBuses, type CooperativeBus } from '../services/bus.service';
import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';
import './CooperativeDashboardPage.css';

type DashboardIconName =
  | 'bus'
  | 'layers'
  | 'route'
  | 'calendar'
  | 'users'
  | 'settings'
  | 'arrow'
  | 'clock'
  | 'check'
  | 'alert'
  | 'activity';

function DashboardIcon({ name, size = 22 }: { name: DashboardIconName; size?: number }) {
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

  const paths: Record<DashboardIconName, ReactNode> = {
    bus: (
      <>
        <rect x="4" y="3" width="16" height="16" rx="3" />
        <path d="M4 11h16M8 19v2m8-2v2M8 7h.01M16 7h.01M7 15h2m6 0h2" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    route: (
      <>
        <circle cx="5" cy="6" r="2" />
        <path d="M7 6h9a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8" />
        <path d="m16 18 3 4 3-4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4m10-4v4M3 10h18M8 14h2m4 0h2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2H3Zm14-15a3 3 0 0 1 0 6m0 3a5 5 0 0 1 4 5v1" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a2 2 0 0 0 .4 2.2l-2.5 2.5a2 2 0 0 0-2.2-.4l-1 1.7h-3.5l-1-1.7a2 2 0 0 0-2.2.4l-2.5-2.5a2 2 0 0 0 .4-2.2l-1.7-1v-3.5l1.7-1a2 2 0 0 0-.4-2.2l2.5-2.5a2 2 0 0 0 2.2.4l1-1.7h3.5l1 1.7a2 2 0 0 0 2.2-.4l2.5 2.5a2 2 0 0 0-.4 2.2l1.7 1V14l-1.7 1Z" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    alert: (
      <>
        <path d="M10.4 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.6 4.3a1.9 1.9 0 0 0-3.2 0ZM12 9v5m0 3h.01" />
      </>
    ),
    activity: (
      <>
        <path d="M3 17h3l3-7 4 10 3-7h5" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const metrics: Array<{
  key: 'buses' | 'groups' | 'routes' | 'frequencies';
  title: string;
  icon: DashboardIconName;
  href: string;
  detail: string;
}> = [
  {
    key: 'buses',
    title: 'Buses registrados',
    icon: 'bus',
    href: '/cooperativa/buses',
    detail: 'Flota de la cooperativa',
  },
  {
    key: 'groups',
    title: 'Grupos de buses',
    icon: 'layers',
    href: '/cooperativa/grupos',
    detail: 'Organización de la flota',
  },
  {
    key: 'routes',
    title: 'Rutas activas',
    icon: 'route',
    href: '/cooperativa/rutas',
    detail: 'Recorridos habilitados',
  },
  {
    key: 'frequencies',
    title: 'Frecuencias activas',
    icon: 'calendar',
    href: '/cooperativa/rutas',
    detail: 'Servicios habilitados',
  },
];

const quickActions: Array<{
  title: string;
  description: string;
  href: string;
  icon: DashboardIconName;
  tone: string;
}> = [
  {
    title: 'Buses',
    description: 'Registrar y gestionar',
    href: '/cooperativa/buses',
    icon: 'bus',
    tone: 'green',
  },
  {
    title: 'Grupos',
    description: 'Organizar la flota',
    href: '/cooperativa/grupos',
    icon: 'layers',
    tone: 'blue',
  },
  {
    title: 'Rutas y frecuencias',
    description: 'Configurar servicios',
    href: '/cooperativa/rutas',
    icon: 'route',
    tone: 'purple',
  },
  {
    title: 'Oficinistas',
    description: 'Gestionar usuarios',
    href: '/cooperativa/oficinistas',
    icon: 'users',
    tone: 'rose',
  },
  {
    title: 'Configuración',
    description: 'Identidad institucional',
    href: '/cooperativa/configuracion',
    icon: 'settings',
    tone: 'mint',
  },
];

function getLatestAssignments(
  assignments: CooperativeRouteFrequencyAssignment[],
): CooperativeRouteFrequencyAssignment[] {
  return [...assignments]
    .sort((a, b) => (b.lastDepartureAt ?? '').localeCompare(a.lastDepartureAt ?? ''))
    .slice(0, 5);
}

export function CooperativeDashboardPage() {
  const [cooperative, setCooperative] = useState<CooperativeProfile | null>(null);
  const [buses, setBuses] = useState<CooperativeBus[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [routesSummary, setRoutesSummary] = useState<CooperativeRouteFrequencySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      try {
        const [profile, cooperativeBuses, busGroups, summary] = await Promise.all([
          getAuthenticatedCooperativeProfile(),
          getCooperativeBuses(),
          getCooperativeBusGroups(),
          getCooperativeRouteFrequencySummary(),
        ]);
        if (active) {
          setCooperative(profile);
          setBuses(cooperativeBuses);
          setGroups(busGroups);
          setRoutesSummary(summary);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar el resumen de la cooperativa.',
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  const activeBuses = buses.filter((bus) => bus.status === 'operativo').length;
  const maintenanceBuses = buses.filter((bus) => bus.status === 'mantenimiento').length;
  const inactiveBuses = buses.filter((bus) => bus.status === 'fuera_de_servicio').length;
  const activePercentage = buses.length ? Math.round((activeBuses / buses.length) * 100) : 0;
  const maintenancePercentage = buses.length ? (maintenanceBuses / buses.length) * 100 : 0;
  const activeArc = buses.length ? (activeBuses / buses.length) * 100 : 0;
  const fleetChart = {
    background: `conic-gradient(var(--coop-primary, #129458) 0% ${activeArc}%, #f5b844 ${activeArc}% ${activeArc + maintenancePercentage}%, #d8dde7 ${activeArc + maintenancePercentage}% 100%)`,
  };
  const metricValues = {
    buses: buses.length,
    groups: groups.length,
    routes: routesSummary?.activeRoutes ?? 0,
    frequencies: routesSummary?.activeFrequencies ?? 0,
  };
  const assignments = getLatestAssignments(routesSummary?.busAssignments ?? []);
  const displayName = cooperative?.name ?? 'Tu cooperativa';
  const initials = displayName.trim().slice(0, 2).toUpperCase();

  return (
    <section className="cooperative-dashboard" aria-labelledby="cooperative-dashboard-title">
      <header className="cooperative-dashboard__heading">
        <div>
          <p className="cooperative-dashboard__eyebrow">Centro de operaciones</p>
          <h2 id="cooperative-dashboard-title">Panel de control</h2>
          <p>Resumen general de tu cooperativa y su operación.</p>
        </div>
        <span className="cooperative-dashboard__date">
          <DashboardIcon name="calendar" size={17} />
          {new Intl.DateTimeFormat('es-EC', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}
        </span>
      </header>

      {isLoading && (
        <p className="cooperative-dashboard__notice" role="status">
          Cargando información de la cooperativa...
        </p>
      )}
      {error && (
        <p className="cooperative-dashboard__error" role="alert">
          {error}
        </p>
      )}

      {!isLoading && !error && cooperative && routesSummary && (
        <>
          <section className="cooperative-dashboard__hero" aria-label="Identidad institucional">
            <div className="cooperative-dashboard__hero-glow" aria-hidden="true" />
            <div className="cooperative-dashboard__hero-brand">
              <div className="cooperative-dashboard__hero-logo">
                {cooperative.logoUrl && !logoFailed ? (
                  <img
                    src={cooperative.logoUrl}
                    alt={`Logotipo de ${displayName}`}
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  <span aria-label="Iniciales de la cooperativa">{initials}</span>
                )}
              </div>
              <div className="cooperative-dashboard__hero-copy">
                <span className="cooperative-dashboard__hero-kicker">
                  Cooperativa de transporte
                </span>
                <h3>{displayName}</h3>
                <p>Gestiona tu flota, recorridos y frecuencias desde un solo lugar.</p>
                <div className="cooperative-dashboard__hero-facts">
                  <span>
                    RUC: <strong>{cooperative.ruc}</strong>
                  </span>
                  {cooperative.email && (
                    <span>
                      Correo: <strong>{cooperative.email}</strong>
                    </span>
                  )}
                  {cooperative.phone && (
                    <span>
                      Teléfono: <strong>{cooperative.phone}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="cooperative-dashboard__hero-art" aria-hidden="true">
              <svg viewBox="0 0 380 200" fill="none" role="presentation">
                <path
                  d="M0 158 78 73l42 42 61-81 88 102 51-56 60 78v42H0Z"
                  fill="white"
                  fillOpacity=".11"
                />
                <path
                  d="m93 91 27 24 61-81 42 49-43-19-20 30-18-15-22 45Z"
                  fill="white"
                  fillOpacity=".2"
                />
                <path
                  d="M34 168c76-31 154-29 312-3"
                  stroke="white"
                  strokeOpacity=".5"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <rect
                  x="99"
                  y="101"
                  width="203"
                  height="59"
                  rx="15"
                  stroke="white"
                  strokeWidth="6"
                />
                <path
                  d="M108 120h187M170 105v51M222 105v51M273 105v51"
                  stroke="white"
                  strokeWidth="5"
                  strokeOpacity=".85"
                />
                <circle
                  cx="148"
                  cy="163"
                  r="14"
                  fill="var(--coop-secondary, #17335f)"
                  stroke="white"
                  strokeWidth="6"
                />
                <circle
                  cx="264"
                  cy="163"
                  r="14"
                  fill="var(--coop-secondary, #17335f)"
                  stroke="white"
                  strokeWidth="6"
                />
                <path
                  d="m300 139 22-3M102 139H83"
                  stroke="white"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </section>

          <section
            className="cooperative-dashboard__metrics"
            aria-label="Indicadores de la cooperativa"
          >
            {metrics.map((metric) => (
              <Link
                to={metric.href}
                className={`cooperative-dashboard__metric cooperative-dashboard__metric--${metric.key}`}
                key={metric.key}
              >
                <span className="cooperative-dashboard__metric-icon">
                  <DashboardIcon name={metric.icon} size={25} />
                </span>
                <span className="cooperative-dashboard__metric-info">
                  <span className="cooperative-dashboard__metric-label">{metric.title}</span>
                  <strong>{metricValues[metric.key]}</strong>
                  <small>{metric.detail}</small>
                </span>
                <DashboardIcon name="arrow" size={17} />
              </Link>
            ))}
          </section>

          <section
            className="cooperative-dashboard__quick"
            aria-labelledby="cooperative-quick-title"
          >
            <div className="cooperative-dashboard__section-heading">
              <div className="cooperative-dashboard__section-icon">
                <DashboardIcon name="activity" />
              </div>
              <div>
                <h3 id="cooperative-quick-title">Acciones rápidas</h3>
                <p>Accede a los módulos que utilizas con mayor frecuencia.</p>
              </div>
            </div>
            <div className="cooperative-dashboard__quick-grid">
              {quickActions.map((action) => (
                <Link
                  key={action.title}
                  to={action.href}
                  className={`cooperative-dashboard__quick-link cooperative-dashboard__quick-link--${action.tone}`}
                >
                  <span className="cooperative-dashboard__quick-icon">
                    <DashboardIcon name={action.icon} size={23} />
                  </span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <DashboardIcon name="arrow" size={16} />
                </Link>
              ))}
            </div>
          </section>

          <div className="cooperative-dashboard__overview">
            <section
              className="cooperative-dashboard__panel"
              aria-labelledby="cooperative-activity-title"
            >
              <div className="cooperative-dashboard__panel-heading">
                <div className="cooperative-dashboard__section-icon">
                  <DashboardIcon name="clock" />
                </div>
                <div>
                  <h3 id="cooperative-activity-title">Asignaciones registradas</h3>
                  <p>Resumen de viajes asociados a buses</p>
                </div>
              </div>
              {assignments.length ? (
                <ul className="cooperative-dashboard__assignment-list">
                  {assignments.map((assignment) => (
                    <li
                      key={`${assignment.busId}-${assignment.routeId}-${assignment.departureTime}-${assignment.resolutionNumber}`}
                    >
                      <span className="cooperative-dashboard__assignment-icon">
                        <DashboardIcon name="route" size={19} />
                      </span>
                      <span className="cooperative-dashboard__assignment-text">
                        <strong>
                          {assignment.originCity} → {assignment.destinationCity}
                        </strong>
                        <small>
                          Bus {assignment.busNumber} · {assignment.departureTime} ·{' '}
                          {assignment.tripCount}{' '}
                          {assignment.tripCount === 1 ? 'viaje registrado' : 'viajes registrados'}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="cooperative-dashboard__empty">
                  <DashboardIcon name="calendar" size={28} />
                  <strong>Aún no hay asignaciones</strong>
                  <span>Los viajes vinculados a buses y frecuencias aparecerán aquí.</span>
                </div>
              )}
            </section>

            <section
              className="cooperative-dashboard__panel"
              aria-labelledby="cooperative-fleet-title"
            >
              <div className="cooperative-dashboard__panel-heading">
                <div className="cooperative-dashboard__section-icon">
                  <DashboardIcon name="bus" />
                </div>
                <div>
                  <h3 id="cooperative-fleet-title">Estado de la flota</h3>
                  <p>Disponibilidad según el estado de los buses</p>
                </div>
              </div>
              {buses.length ? (
                <div className="cooperative-dashboard__fleet-content">
                  <div
                    className="cooperative-dashboard__donut"
                    style={fleetChart}
                    role="img"
                    aria-label={`${activeBuses} buses operativos de ${buses.length} registrados (${activePercentage}%)`}
                  >
                    <div>
                      <strong>{activePercentage}%</strong>
                      <span>Operativos</span>
                    </div>
                  </div>
                  <dl className="cooperative-dashboard__fleet-legend">
                    <div>
                      <dt>
                        <span className="cooperative-dashboard__dot cooperative-dashboard__dot--active" />
                        Operativos
                      </dt>
                      <dd>{activeBuses}</dd>
                    </div>
                    <div>
                      <dt>
                        <span className="cooperative-dashboard__dot cooperative-dashboard__dot--maintenance" />
                        En mantenimiento
                      </dt>
                      <dd>{maintenanceBuses}</dd>
                    </div>
                    <div>
                      <dt>
                        <span className="cooperative-dashboard__dot cooperative-dashboard__dot--inactive" />
                        Fuera de servicio
                      </dt>
                      <dd>{inactiveBuses}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="cooperative-dashboard__empty">
                  <DashboardIcon name="bus" size={28} />
                  <strong>No hay buses registrados</strong>
                  <span>Agrega un vehículo para visualizar el estado de tu flota.</span>
                </div>
              )}
            </section>

            <section
              className="cooperative-dashboard__panel"
              aria-labelledby="cooperative-status-title"
            >
              <div className="cooperative-dashboard__panel-heading">
                <div className="cooperative-dashboard__section-icon">
                  <DashboardIcon name="check" />
                </div>
                <div>
                  <h3 id="cooperative-status-title">Resumen de gestión</h3>
                  <p>Indicadores disponibles actualmente</p>
                </div>
              </div>
              <div className="cooperative-dashboard__status-list">
                <div>
                  <DashboardIcon name="bus" size={20} />
                  <span>Buses operativos</span>
                  <strong>{activeBuses}</strong>
                </div>
                <div>
                  <DashboardIcon name="layers" size={20} />
                  <span>Grupos registrados</span>
                  <strong>{groups.length}</strong>
                </div>
                <div>
                  <DashboardIcon name="route" size={20} />
                  <span>Rutas activas</span>
                  <strong>{routesSummary.activeRoutes}</strong>
                </div>
                <div>
                  <DashboardIcon name="calendar" size={20} />
                  <span>Frecuencias activas</span>
                  <strong>{routesSummary.activeFrequencies}</strong>
                </div>
              </div>
              {maintenanceBuses + inactiveBuses > 0 && (
                <p className="cooperative-dashboard__fleet-warning">
                  <DashboardIcon name="alert" size={17} />
                  {maintenanceBuses + inactiveBuses}{' '}
                  {maintenanceBuses + inactiveBuses === 1 ? 'bus requiere' : 'buses requieren'}{' '}
                  revisión de estado.
                </p>
              )}
            </section>
          </div>
          <div className="cooperative-dashboard__footer">
            <span>Los datos reflejan los registros actuales de la cooperativa.</span>
            <Link to="/cooperativa/configuracion">
              Actualizar información institucional <DashboardIcon name="arrow" size={16} />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
