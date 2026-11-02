import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  cancelPassengerReservation,
  getPassengerReservations,
  type ReservationRead,
} from '../services/reservation.service';
import './PassengerTripSearchPage.css';

// Estados que el backend permite cancelar.
const cancellableStatuses = ['pending_payment', 'payment_review'];

function canCancelReservation(status: string): boolean {
  return cancellableStatuses.includes(status);
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending_payment':
      return 'Pendiente de pago';
    case 'payment_review':
      return 'Pago en revisión';
    case 'confirmed':
      return 'Confirmada';
    case 'expired':
      return 'Vencida';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

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

  // Controlar la cancelación de reservas.
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Consultar las reservas del usuario autenticado.
  useEffect(() => {
    let active = true;

    async function loadReservations() {
      setLoading(true);
      setError(null);

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
    if (loading || cancellingId !== null) return;

    setActionError(null);
    setSuccessMessage(null);
    setRefreshKey((current) => current + 1);
  }

  // Solicitar la cancelación de una reserva.
  async function handleCancelReservation(reservationId: number) {
    if (cancellingId !== null || loading) return;

    const reservation = reservations.find((item) => item.id === reservationId);

    if (!reservation || !canCancelReservation(reservation.status)) {
      return;
    }

    const confirmed = window.confirm(
      `¿Estás seguro de cancelar la reserva #${reservationId}?\n\n` +
        'Los asientos reservados serán liberados. Esta acción no se puede deshacer.',
    );

    if (!confirmed) return;

    setCancellingId(reservationId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const updatedReservation = await cancelPassengerReservation(reservationId);

      // Actualizar la reserva con la respuesta real del backend.
      setReservations((current) =>
        current.map((item) => (item.id === reservationId ? updatedReservation : item)),
      );

      setSuccessMessage(`La reserva #${reservationId} fue cancelada correctamente.`);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? `Reserva #${reservationId}: ${err.message}`
          : `No se pudo cancelar la reserva #${reservationId}.`,
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">MIS VIAJES</p>

        <h1>Mis reservas</h1>

        <p>Consulta tus reservas, revisa sus estados y cancela aquellas que todavía lo permitan.</p>
      </header>

      {/* Acciones principales */}
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
          disabled={loading || cancellingId !== null}
        >
          {loading ? 'Actualizando...' : 'Actualizar reservas'}
        </button>

        <Link to="/pasajero/viajes">Buscar otro viaje</Link>
      </div>

      {/* Mensajes de operaciones */}
      {successMessage && (
        <p role="status" style={{ color: '#15803d' }}>
          {successMessage}
        </p>
      )}

      {actionError && (
        <p role="alert" className="passenger-trip-search__error">
          {actionError}
        </p>
      )}

      {/* Cargando reservas */}
      {loading && <p role="status">Cargando tus reservas...</p>}

      {/* Error de consulta */}
      {error && (
        <div role="alert" className="passenger-trip-search__error">
          <p>{error}</p>
          <p>Puedes intentar actualizar nuevamente.</p>
        </div>
      )}

      {/* Sin reservas */}
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

      {/* Listado de reservas */}
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
            {reservations.map((reservation) => {
              const canCancel = canCancelReservation(reservation.status);

              const isCancelling = cancellingId === reservation.id;

              return (
                <article key={reservation.id} className="passenger-trip-search__card">
                  <h3>Reserva #{reservation.id}</h3>

                  <p>
                    <strong>Estado:</strong> {getStatusLabel(reservation.status)}
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
                      <strong>Vencimiento de la reserva:</strong>{' '}
                      {formatDate(reservation.expiresAt)}
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

                  {reservation.status === 'confirmed' && (
                    <p style={{ marginTop: '1rem' }}>
                      <Link to={`/pasajero/boletos?reserva=${reservation.id}`}>
                        Ver boletos de esta reserva
                      </Link>
                    </p>
                  )}

                  {reservation.status === 'pending_payment' && (
                    <p style={{ marginTop: '1rem' }}>
                      <Link to={`/pasajero/reservas/${reservation.id}/pago`}>Registrar pago</Link>
                    </p>
                  )}

                  {(reservation.status === 'payment_review' ||
                    reservation.status === 'confirmed') && (
                    <p style={{ marginTop: '1rem' }}>
                      <Link to={`/pasajero/reservas/${reservation.id}/pago`}>
                        Consultar estado del pago
                      </Link>
                    </p>
                  )}

                  {/* Cancelar solo en estados permitidos */}
                  {canCancel && (
                    <div style={{ marginTop: '1.5rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCancelReservation(reservation.id);
                        }}
                        disabled={cancellingId !== null || loading}
                        style={{
                          padding: '0.7rem 1rem',
                          border: '1px solid #dc2626',
                          borderRadius: '8px',
                          backgroundColor: 'transparent',
                          color: '#dc2626',
                          fontWeight: 600,
                          cursor: cancellingId !== null ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isCancelling ? 'Cancelando reserva...' : 'Cancelar reserva'}
                      </button>

                      <p
                        style={{
                          marginTop: '0.5rem',
                          fontSize: '0.9rem',
                        }}
                      >
                        Puedes cancelar mientras la reserva esté pendiente de pago o en revisión.
                      </p>
                    </div>
                  )}

                  {/* Información de estados finales */}
                  {reservation.status === 'cancelled' && <p>Esta reserva fue cancelada.</p>}

                  {reservation.status === 'expired' && (
                    <p>Esta reserva venció y ya no puede cancelarse.</p>
                  )}

                  {reservation.status === 'confirmed' && (
                    <p>
                      Esta reserva está confirmada y no permite cancelación desde esta pantalla.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
