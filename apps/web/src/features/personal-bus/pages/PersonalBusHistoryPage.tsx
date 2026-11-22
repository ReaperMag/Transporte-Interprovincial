import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyBusHistory } from '../services/personalBus.service';
import type { BusTripHistory } from '../types/personalBus.types';
import { TRIP_STATUS_LABELS, formatDateTime, formatDuration, formatMoney } from '../utils/format';
import '../../oficinista/pages/OficinistaOperationsPage.css';
import './PersonalBusPages.css';

export function PersonalBusHistoryPage() {
  const [history, setHistory] = useState<BusTripHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyBusHistory()
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'No fue posible cargar el historial.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="oficinista-operations personal-bus">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">Personal del bus</p>
        <h1>Historial del bus</h1>
        <p>
          {history
            ? `Bus ${history.busNumber} · ${history.busPlate}`
            : 'Viajes del bus, aunque los haya manejado otra persona.'}
        </p>
      </header>

      {error && (
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
      )}

      <section className="oficinista-operations__card">
        {!history && !error ? (
          <p role="status">Cargando historial...</p>
        ) : history && history.trips.length === 0 ? (
          <p className="oficinista-operations__empty">El bus todavía no tiene viajes realizados.</p>
        ) : (
          <div className="oficinista-operations__list">
            {history?.trips.map((trip) => (
              <Link
                className="personal-bus__trip-link"
                key={trip.tripId}
                to={`/personal-bus/viajes/${trip.tripId}/reporte`}
              >
                <article className="oficinista-operations__item">
                  <div className="oficinista-operations__item-heading">
                    <div>
                      <h3>
                        {trip.originCityName} - {trip.destinationCityName}
                      </h3>
                      <p>{formatDateTime(trip.scheduledDepartureAt)}</p>
                    </div>
                    <strong>{formatMoney(trip.total)}</strong>
                  </div>
                  <p>
                    <span className={`personal-bus__status personal-bus__status--${trip.status}`}>
                      {TRIP_STATUS_LABELS[trip.status]}
                    </span>{' '}
                    Duración {formatDuration(trip.durationMinutes)} · {trip.passengersBoarded}{' '}
                    abordaron · {trip.onboardSales} venta{trip.onboardSales === 1 ? '' : 's'} a
                    bordo
                    {trip.openProblems > 0 &&
                      ` · ${trip.openProblems} problema${trip.openProblems === 1 ? '' : 's'} sin atender`}
                  </p>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
