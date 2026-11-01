import { useEffect, useState } from 'react';
import {
  getAuthenticatedCooperativeProfile,
  getCooperativeRouteFrequencySummary,
  type CooperativeProfile,
  type CooperativeRouteFrequencySummary,
} from '../services/cooperative.service';
import { getCooperativeBuses, type CooperativeBus } from '../services/bus.service';
import {
  getCooperativeBusGroups,
  type CooperativeBusGroup,
} from '../services/busGroup.service';
import './CooperativeDashboardPage.css';

export function CooperativeDashboardPage() {
  const [cooperative, setCooperative] = useState<CooperativeProfile | null>(null);
  const [buses, setBuses] = useState<CooperativeBus[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [routesSummary, setRoutesSummary] = useState<CooperativeRouteFrequencySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCooperative() {
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
              : 'No fue posible obtener la información de la cooperativa.',
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadCooperative();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="cooperative-dashboard" aria-labelledby="cooperative-dashboard-title">
      <header className="cooperative-dashboard__header">
        <p className="cooperative-dashboard__eyebrow">Área de trabajo</p>
        <h2 id="cooperative-dashboard-title" className="cooperative-dashboard__title">
          Bienvenido
        </h2>
        <p className="cooperative-dashboard__description">
          Resumen de la cooperativa, su flota y la programación disponible.
        </p>
      </header>

      <section
        className="cooperative-dashboard__identity"
        aria-labelledby="cooperative-identity-title"
        aria-live="polite"
      >
        <h3 id="cooperative-identity-title">Datos de la cooperativa</h3>
        {isLoading && <p role="status">Cargando resumen de la cooperativa...</p>}
        {error && (
          <p className="cooperative-dashboard__error" role="alert">
            {error}
          </p>
        )}
        {cooperative && (
          <dl>
            <div>
              <dt>Nombre</dt>
              <dd>{cooperative.name}</dd>
            </div>
            <div>
              <dt>RUC</dt>
              <dd>{cooperative.ruc}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{cooperative.email || 'No registrado'}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{cooperative.phone || 'No registrado'}</dd>
            </div>
            <div>
              <dt>Dirección</dt>
              <dd>{cooperative.address || 'No registrada'}</dd>
            </div>
            {cooperative.websiteUrl && (
              <div>
                <dt>Sitio web</dt>
                <dd>
                  <a href={cooperative.websiteUrl} target="_blank" rel="noreferrer">
                    {cooperative.websiteUrl}
                  </a>
                </dd>
              </div>
            )}
            {cooperative.description && (
              <div>
                <dt>Descripción</dt>
                <dd>{cooperative.description}</dd>
              </div>
            )}
            {cooperative.facebookUrl && (
              <div>
                <dt>Facebook</dt>
                <dd>
                  <a href={cooperative.facebookUrl} target="_blank" rel="noreferrer">
                    {cooperative.facebookUrl}
                  </a>
                </dd>
              </div>
            )}
            {cooperative.instagramUrl && (
              <div>
                <dt>Instagram</dt>
                <dd>
                  <a href={cooperative.instagramUrl} target="_blank" rel="noreferrer">
                    {cooperative.instagramUrl}
                  </a>
                </dd>
              </div>
            )}
            {cooperative.tiktokUrl && (
              <div>
                <dt>TikTok</dt>
                <dd>
                  <a href={cooperative.tiktokUrl} target="_blank" rel="noreferrer">
                    {cooperative.tiktokUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {routesSummary && (
        <>
          <section className="cooperative-dashboard__metrics" aria-label="Resumen operativo">
            <article>
              <span>Buses registrados</span>
              <strong>{buses.length}</strong>
            </article>
            <article>
              <span>Grupos de buses</span>
              <strong>{groups.length}</strong>
            </article>
            <article>
              <span>Rutas activas</span>
              <strong>{routesSummary.activeRoutes}</strong>
            </article>
            <article>
              <span>Frecuencias activas</span>
              <strong>{routesSummary.activeFrequencies}</strong>
            </article>
          </section>

          <section className="cooperative-dashboard__routes" aria-labelledby="cooperative-routes-title">
            <h3 id="cooperative-routes-title">Rutas y frecuencias asociadas a buses</h3>
            <p>
              La ruta y frecuencia se asignan a un bus mediante los viajes registrados. Esta tabla
              resume esas asignaciones; no reemplaza la administración de horarios.
            </p>
            {routesSummary.busAssignments.length > 0 ? (
              <div className="cooperative-dashboard__table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bus</th>
                      <th>Placa</th>
                      <th>Ruta</th>
                      <th>Salida</th>
                      <th>Resolución ANT</th>
                      <th>Viajes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routesSummary.busAssignments.map((assignment) => (
                      <tr key={`${assignment.busId}-${assignment.routeId}-${assignment.departureTime}-${assignment.resolutionNumber}`}>
                        <td>{assignment.busNumber}</td>
                        <td>{assignment.plate}</td>
                        <td>{assignment.originCity} → {assignment.destinationCity}</td>
                        <td>{assignment.departureTime}</td>
                        <td>{assignment.resolutionNumber}</td>
                        <td>{assignment.tripCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cooperative-dashboard__empty">
                No hay viajes registrados que relacionen buses con rutas y frecuencias.
              </p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
