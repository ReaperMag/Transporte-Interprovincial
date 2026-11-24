import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { cooperativeTripReportPdfUrl, getCooperativeTripReport } from '../services/reports.service';
import type { TripReport } from '../types/reports.types';
import {
  CATEGORY_LABELS,
  PROBLEM_TYPE_LABELS,
  TRIP_STATUS_LABELS,
  formatDateTime,
  formatDuration,
  formatMoney,
} from '../utils/format';
import '../../oficinista/pages/OficinistaOperationsPage.css';
import './ReportsPages.css';

interface TripReportPageProps {
  // A dónde vuelve el enlace superior: el historial del bus o los problemas reportados.
  backTo: string;
  backLabel: string;
}

export function TripReportPage({ backTo, backLabel }: TripReportPageProps) {
  const tripId = Number(useParams().tripId);
  const [report, setReport] = useState<TripReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCooperativeTripReport(tripId)
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'No fue posible cargar el reporte.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [tripId]);

  if (error) {
    return (
      <section className="oficinista-operations reports-page">
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
        <Link to={backTo}>{backLabel}</Link>
      </section>
    );
  }
  if (!report) return <p role="status">Cargando reporte...</p>;

  const { passengers, totals } = report;

  return (
    <section className="oficinista-operations reports-page">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">
          <Link to={backTo}>{backLabel}</Link> / Viaje #{report.tripId}
        </p>
        <h1>
          {report.originCityName} - {report.destinationCityName}
        </h1>
        <p>
          Bus {report.busNumber} · {report.busPlate} · {TRIP_STATUS_LABELS[report.status]}
        </p>
      </header>

      <div className="oficinista-operations__actions">
        <a
          className="oficinista-operations__button"
          href={cooperativeTripReportPdfUrl(report.tripId)}
        >
          Descargar PDF
        </a>
      </div>

      <section className="oficinista-operations__card">
        <h2>Horarios</h2>
        <dl className="oficinista-operations__details">
          <div>
            <dt>Salida programada</dt>
            <dd>{formatDateTime(report.scheduledDepartureAt)}</dd>
          </div>
          <div>
            <dt>Inicio del abordaje</dt>
            <dd>{formatDateTime(report.boardingStartedAt)}</dd>
          </div>
          <div>
            <dt>Salida real</dt>
            <dd>{formatDateTime(report.startedAt)}</dd>
          </div>
          <div>
            <dt>Llegada</dt>
            <dd>{formatDateTime(report.finishedAt)}</dd>
          </div>
          <div>
            <dt>Duración</dt>
            <dd>{formatDuration(report.durationMinutes)}</dd>
          </div>
          <div>
            <dt>Inició el abordaje</dt>
            <dd>{report.boardingStartedByName ?? '-'}</dd>
          </div>
          <div>
            <dt>Inició el viaje</dt>
            <dd>{report.startedByName ?? '-'}</dd>
          </div>
          <div>
            <dt>Finalizó el viaje</dt>
            <dd>{report.finishedByName ?? '-'}</dd>
          </div>
        </dl>
      </section>

      <section className="oficinista-operations__card">
        <h2>Pasajeros</h2>
        <dl className="oficinista-operations__details">
          <div>
            <dt>Boletos vendidos</dt>
            <dd>{passengers.ticketsSold}</dd>
          </div>
          <div>
            <dt>Abordaron</dt>
            <dd>{passengers.boarded}</dd>
          </div>
          <div>
            <dt>No se presentaron</dt>
            <dd>{passengers.noShow}</dd>
          </div>
          <div>
            <dt>Rechazados por categoría</dt>
            <dd>{passengers.rejected}</dd>
          </div>
          <div>
            <dt>Ventas a bordo</dt>
            <dd>{passengers.onboardSales}</dd>
          </div>
        </dl>
      </section>

      <section className="oficinista-operations__card">
        <h2>Recaudación</h2>
        <dl className="oficinista-operations__details">
          <div>
            <dt>En línea</dt>
            <dd>{formatMoney(totals.online)}</dd>
          </div>
          <div>
            <dt>Oficina</dt>
            <dd>{formatMoney(totals.office)}</dd>
          </div>
          <div>
            <dt>A bordo (efectivo)</dt>
            <dd>{formatMoney(totals.onBoard)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>
              <strong>{formatMoney(totals.total)}</strong>
            </dd>
          </div>
        </dl>
      </section>

      <section className="oficinista-operations__card">
        <h2>Ventas a bordo</h2>
        {report.onboardSales.length === 0 ? (
          <p className="oficinista-operations__empty">No hubo ventas a bordo.</p>
        ) : (
          <ul className="reports-list">
            {report.onboardSales.map((sale) => (
              <li key={`${sale.seatNumber}-${sale.soldAt}`}>
                <strong>Asiento {sale.seatNumber}</strong>
                <span>
                  {sale.passengerName} ({CATEGORY_LABELS[sale.passengerCategory]}) ·{' '}
                  {sale.originCityName} - {sale.destinationCityName} · Cobró{' '}
                  {sale.soldByName ?? '-'}
                </span>
                <span>{formatMoney(sale.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="oficinista-operations__card">
        <h2>Problemas reportados</h2>
        {report.problems.length === 0 ? (
          <p className="oficinista-operations__empty">No se reportaron problemas.</p>
        ) : (
          <ul className="reports-list">
            {report.problems.map((problem) => (
              <li key={problem.id}>
                <strong>
                  {problem.problemType ? PROBLEM_TYPE_LABELS[problem.problemType] : 'Problema'}
                </strong>
                <span>{problem.comment}</span>
                <small>
                  {formatDateTime(problem.reportedAt)} · {problem.reportedByName ?? '-'} ·{' '}
                  {problem.resolvedAt
                    ? `Atendido por ${problem.resolvedByName ?? 'la oficina'}`
                    : 'Sin atender'}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

// Reporte abierto desde el historial: vuelve al mismo bus que se estaba revisando.
export function CooperativeTripReportPage() {
  const [searchParams] = useSearchParams();
  const busId = searchParams.get('bus');
  return (
    <TripReportPage
      backTo={busId ? `/cooperativa/reportes?bus=${busId}` : '/cooperativa/reportes'}
      backLabel="Historial del bus"
    />
  );
}
