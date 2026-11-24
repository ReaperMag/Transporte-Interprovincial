import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getCooperativeBuses } from '../../cooperatives/services/bus.service';
import type { CooperativeBus } from '../../cooperatives/services/bus.service';
import { getCooperativeBusHistory } from '../services/reports.service';
import type { BusTripHistory } from '../types/reports.types';
import { TRIP_STATUS_LABELS, formatDateTime, formatDuration, formatMoney } from '../utils/format';
import '../../oficinista/pages/OficinistaOperationsPage.css';
import './ReportsPages.css';

export function CooperativeBusHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedBusId = Number(searchParams.get('bus')) || null;
  const [buses, setBuses] = useState<CooperativeBus[]>([]);
  const [history, setHistory] = useState<BusTripHistory | null>(null);
  const [loadingBuses, setLoadingBuses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCooperativeBuses()
      .then((result) => {
        if (active) setBuses(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'No fue posible cargar los buses.',
          );
        }
      })
      .finally(() => {
        if (active) setLoadingBuses(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (selectedBusId === null) return;
    let active = true;
    getCooperativeBusHistory(selectedBusId)
      .then((result) => {
        if (active) {
          setHistory(result);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setHistory(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar el historial del bus.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [selectedBusId]);

  const visibleHistory = history && history.busId === selectedBusId ? history : null;

  return (
    <section className="oficinista-operations reports-page" aria-labelledby="bus-history-title">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">Reportes</p>
        <h1 id="bus-history-title">Historial de viajes por bus</h1>
        <p>Elige un bus para ver sus viajes desde el abordaje y abre el reporte de cada uno.</p>
      </header>

      {error && (
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
      )}

      <section className="oficinista-operations__card">
        <label className="reports-page__filter">
          Bus
          <select
            disabled={loadingBuses}
            onChange={(event) => {
              setError(null);
              setSearchParams(event.target.value ? { bus: event.target.value } : {});
            }}
            value={selectedBusId ?? ''}
          >
            <option value="">{loadingBuses ? 'Cargando buses...' : 'Selecciona un bus'}</option>
            {buses.map((bus) => (
              <option key={bus.id} value={bus.id}>
                Bus {bus.number} · {bus.plate}
              </option>
            ))}
          </select>
        </label>
      </section>

      {selectedBusId !== null && (
        <section className="oficinista-operations__card">
          {!visibleHistory ? (
            !error && <p role="status">Cargando historial...</p>
          ) : (
            <>
              <div className="oficinista-operations__card-heading">
                <div>
                  <h2>
                    Bus {visibleHistory.busNumber} · {visibleHistory.busPlate}
                  </h2>
                  <p>
                    {visibleHistory.trips.length} viaje
                    {visibleHistory.trips.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              {visibleHistory.trips.length === 0 ? (
                <p className="oficinista-operations__empty">
                  Este bus todavía no tiene viajes con abordaje iniciado.
                </p>
              ) : (
                <div className="reports-table-wrap">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>Viaje</th>
                        <th>Ruta</th>
                        <th>Salida programada</th>
                        <th>Estado</th>
                        <th>Duración</th>
                        <th>Abordaron</th>
                        <th>Ventas a bordo</th>
                        <th>Recaudado</th>
                        <th>Problemas abiertos</th>
                        <th>Reporte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.trips.map((trip) => (
                        <tr key={trip.tripId}>
                          <td>#{trip.tripId}</td>
                          <td>
                            {trip.originCityName} - {trip.destinationCityName}
                          </td>
                          <td>{formatDateTime(trip.scheduledDepartureAt)}</td>
                          <td>{TRIP_STATUS_LABELS[trip.status]}</td>
                          <td>{formatDuration(trip.durationMinutes)}</td>
                          <td>{trip.passengersBoarded}</td>
                          <td>{trip.onboardSales}</td>
                          <td>{formatMoney(trip.total)}</td>
                          <td>{trip.openProblems}</td>
                          <td>
                            <Link
                              to={`/cooperativa/reportes/viajes/${trip.tripId}?bus=${visibleHistory.busId}`}
                            >
                              Ver reporte
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}
