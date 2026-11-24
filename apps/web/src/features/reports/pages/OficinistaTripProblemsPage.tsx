import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getCooperativeTripReport,
  getTripProblems,
  resolveTripProblem,
} from '../services/reports.service';
import type { TripProblem, TripReport } from '../types/reports.types';
import { PROBLEM_TYPE_LABELS, formatDateTime } from '../utils/format';
import '../../oficinista/pages/OficinistaOperationsPage.css';
import './ReportsPages.css';

type TripInfo = Pick<
  TripReport,
  'originCityName' | 'destinationCityName' | 'busNumber' | 'busPlate' | 'scheduledDepartureAt'
>;

// Trae la ruta y el bus de cada viaje para mostrarlos junto al problema.
async function loadTripInfo(problems: TripProblem[]): Promise<Record<number, TripInfo>> {
  const tripIds = [...new Set(problems.map((problem) => problem.tripId))];
  const reports = await Promise.allSettled(tripIds.map((id) => getCooperativeTripReport(id)));
  const info: Record<number, TripInfo> = {};
  reports.forEach((result) => {
    if (result.status === 'fulfilled') info[result.value.tripId] = result.value;
  });
  return info;
}

export function OficinistaTripProblemsPage() {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [problems, setProblems] = useState<TripProblem[]>([]);
  const [trips, setTrips] = useState<Record<number, TripInfo>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchProblems = useCallback(async (open: boolean) => {
    const result = await getTripProblems(open);
    return { result, info: await loadTripInfo(result) };
  }, []);

  useEffect(() => {
    let active = true;
    fetchProblems(onlyOpen)
      .then(({ result, info }) => {
        if (!active) return;
        setProblems(result);
        setTrips(info);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar los problemas reportados.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchProblems, onlyOpen]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const { result, info } = await fetchProblems(onlyOpen);
      setProblems(result);
      setTrips(info);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar los problemas reportados.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (problem: TripProblem) => {
    setProcessingId(problem.id);
    setError(null);
    setNotice(null);
    try {
      const resolved = await resolveTripProblem(problem.id);
      setProblems((current) =>
        onlyOpen
          ? current.filter((item) => item.id !== resolved.id)
          : current.map((item) => (item.id === resolved.id ? resolved : item)),
      );
      setNotice(`El problema del viaje #${resolved.tripId} quedó marcado como atendido.`);
    } catch (resolveError) {
      setError(
        resolveError instanceof Error
          ? resolveError.message
          : 'No fue posible marcar el problema como atendido.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="oficinista-operations reports-page" aria-labelledby="trip-problems-title">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">Viajes</p>
        <h1 id="trip-problems-title">Problemas reportados</h1>
        <p>Novedades que el personal del bus reporta durante el abordaje o el viaje.</p>
      </header>

      {error && (
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="oficinista-operations__notice" role="status">
          {notice}
        </p>
      )}

      <section className="oficinista-operations__card">
        <div className="oficinista-operations__card-heading">
          <div>
            <h2>{onlyOpen ? 'Sin atender' : 'Todos los problemas'}</h2>
            {!loading && (
              <p>
                {problems.length} problema{problems.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <div className="oficinista-operations__actions">
            <button
              type="button"
              className="oficinista-operations__button--secondary"
              onClick={() => {
                setLoading(true);
                setNotice(null);
                setOnlyOpen((current) => !current);
              }}
              disabled={loading}
            >
              {onlyOpen ? 'Ver todos' : 'Ver solo sin atender'}
            </button>
            <button
              type="button"
              className="oficinista-operations__button--secondary"
              onClick={() => void reload()}
              disabled={loading}
            >
              Actualizar
            </button>
          </div>
        </div>

        {loading ? (
          <p role="status">Cargando problemas...</p>
        ) : problems.length === 0 ? (
          <p className="oficinista-operations__empty">
            {onlyOpen ? 'No hay problemas sin atender.' : 'Todavía no se reportan problemas.'}
          </p>
        ) : (
          <div className="oficinista-operations__list">
            {problems.map((problem) => {
              const trip = trips[problem.tripId];
              return (
                <article className="oficinista-operations__item" key={problem.id}>
                  <div className="oficinista-operations__item-heading">
                    <div>
                      <h3>
                        {problem.problemType
                          ? PROBLEM_TYPE_LABELS[problem.problemType]
                          : 'Problema'}{' '}
                        · Viaje #{problem.tripId}
                      </h3>
                      <p>
                        {trip
                          ? `${trip.originCityName} - ${trip.destinationCityName} · Bus ${trip.busNumber} · ${trip.busPlate}`
                          : 'Ruta no disponible'}
                      </p>
                    </div>
                    {!problem.resolvedAt && (
                      <span className="oficinista-operations__badge">Sin atender</span>
                    )}
                  </div>
                  <p>{problem.comment}</p>
                  <dl className="oficinista-operations__details">
                    <div>
                      <dt>Reportó</dt>
                      <dd>{problem.reportedByName ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Fecha del reporte</dt>
                      <dd>{formatDateTime(problem.reportedAt)}</dd>
                    </div>
                    {trip && (
                      <div>
                        <dt>Salida programada</dt>
                        <dd>{formatDateTime(trip.scheduledDepartureAt)}</dd>
                      </div>
                    )}
                    {problem.resolvedAt && (
                      <div>
                        <dt>Atendido</dt>
                        <dd>
                          {formatDateTime(problem.resolvedAt)} por{' '}
                          {problem.resolvedByName ?? 'la oficina'}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <div className="oficinista-operations__actions">
                    <Link
                      className="oficinista-operations__button--secondary"
                      to={`/oficinista/reportes/${problem.tripId}`}
                    >
                      Ver reporte del viaje
                    </Link>
                    {!problem.resolvedAt && (
                      <button
                        type="button"
                        className="oficinista-operations__button"
                        disabled={processingId === problem.id}
                        onClick={() => void handleResolve(problem)}
                      >
                        {processingId === problem.id ? 'Guardando...' : 'Marcar como atendido'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
