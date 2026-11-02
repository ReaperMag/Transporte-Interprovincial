import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPassengerReservations, type ReservationRead } from '../services/reservation.service';
import './PassengerTripSearchPage.css';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  });
}

export function PassengerReservationsPage() {
  const [reservations, setReservations] = useState<ReservationRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadReservations() {
      setLoading(true);
      setError(null);
      setReservations([]);

      try {
        const result = await getPassengerReservations();

        if (active) {
          setReservations(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Ocurrió un error al consultar tus reservas.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadReservations();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  function handleRefresh() {
    setRefreshKey((current) => current + 1);
  }

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">MIS VIAJES</p>

        <h1>Mis reservas</h1>

        <p>Consulta las reservas que has realizado, sus pasajeros, asientos y estados.</p>
      </header>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '1.5rem',
        }}
      >
        <button
          type="button"
          className="passenger-trip-search__button"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? 'Actualizando...' : 'Actualizar reservas'}
        </button>

        <Link to="/pasajero/viajes">Buscar otro viaje</Link>
      </div>

      {loading && <p role="status">Cargando tus reservas...</p>}

      {error && (
        <div role="alert" className="passenger-trip-search__error">
          <p>{error}</p>
          <p>Puedes intentar actualizar nuevamente.</p>
        </div>
      )}

      {!loading && !error && reservations.length === 0 && (
        <div className="passenger-trip-search__results">
          <h2>Aún no tienes reservas</h2>

          <p>
            Cuando realices una reserva, podrás consultar aquí los datos de tu viaje y los asientos
            apartados.
          </p>

          <Link to="/pasajero/viajes">Buscar viajes disponibles</Link>
        </div>
      )}

      {!loading && !error && reservations.length > 0 && (
        <div className="passenger-trip-search__results">
          <h2>Reservas registradas</h2>

          <p>
            Tienes {reservations.length}{' '}
            {reservations.length === 1 ? 'reserva registrada' : 'reservas registradas'}.
          </p>

          <div
            style={{
              display: 'grid',
              gap: '1.25rem',
              marginTop: '1.5rem',
            }}
          >
            {reservations.map((reservation) => (
              <article key={reservation.id} className="passenger-trip-search__card">
                <h3>Reserva #{reservation.id}</h3>

                <p>
                  <strong>Estado:</strong> {reservation.status}
                </p>

                <p>
                  <strong>Viaje:</strong> #{reservation.tripId}
                </p>

                <p>
                  <strong>Fecha de salida:</strong> {formatDate(reservation.departureAt)}
                </p>

                <p>
                  <strong>Origen:</strong> Ciudad #{reservation.originCityId}
                </p>

                <p>
                  <strong>Destino:</strong> Ciudad #{reservation.destinationCityId}
                </p>

                {reservation.expiresAt && (
                  <p>
                    <strong>Vencimiento de la reserva:</strong> {formatDate(reservation.expiresAt)}
                  </p>
                )}

                <h4>Pasajeros y asientos</h4>

                {reservation.seats.length > 0 ? (
                  <ul>
                    {reservation.seats.map((seat) => (
                      <li key={seat.seatId}>
                        <strong>Asiento {seat.seatNumber}</strong>
                        {' — '}
                        {seat.passengerName}
                        {' — '}
                        {formatMoney(seat.price)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No hay asientos registrados en esta reserva.</p>
                )}

                <p style={{ marginTop: '1rem' }}>
                  <strong>Total: {formatMoney(reservation.total)}</strong>
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
