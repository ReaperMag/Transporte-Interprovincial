import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getTripSeats, type TripSeatsResponse } from '../services/trip-seats.service';
import './PassengerTripSearchPage.css';

export function PassengerTripSeatsPage() {
  const { tripId: tripIdParam } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();

  const tripId = Number(tripIdParam);
  const originCityId = Number(searchParams.get('origen'));
  const destinationCityId = Number(searchParams.get('destino'));

  const validTrip =
    Number.isSafeInteger(tripId) &&
    tripId > 0 &&
    Number.isSafeInteger(originCityId) &&
    originCityId > 0 &&
    Number.isSafeInteger(destinationCityId) &&
    destinationCityId > 0 &&
    originCityId !== destinationCityId;

  // Información real de los asientos obtenida del backend.
  const [availability, setAvailability] = useState<TripSeatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asientos seleccionados por el pasajero.
  const [selectedSeatIds, setSelectedSeatIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );

  // Consultar la disponibilidad del viaje.
  useEffect(() => {
    if (!validTrip) return;

    let active = true;

    async function loadSeats() {
      setLoading(true);
      setError(null);
      setAvailability(null);
      setSelectedSeatIds(new Set<number>());

      try {
        const result = await getTripSeats(tripId, originCityId, destinationCityId);

        if (active) {
          setAvailability(result);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Ocurrió un error al consultar los asientos.',
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSeats();

    return () => {
      active = false;
    };
  }, [validTrip, tripId, originCityId, destinationCityId]);

  // Seleccionar o deseleccionar un asiento disponible.
  function handleSeatClick(seatId: number) {
    const seat = availability?.seats.find((item) => item.seatId === seatId);

    if (!seat || !seat.isAvailable) {
      return;
    }

    setSelectedSeatIds((current) => {
      const next = new Set(current);

      if (next.has(seatId)) {
        next.delete(seatId);
      } else if (next.size < 10) {
        next.add(seatId);
      }

      return next;
    });
  }

  // Validar los parámetros recibidos desde la búsqueda.
  if (!validTrip) {
    return (
      <section className="passenger-trip-search">
        <h1>Viaje no válido</h1>
        <p>No se recibió la información necesaria del viaje.</p>
        <Link to="/pasajero/viajes">Volver a buscar viajes</Link>
      </section>
    );
  }

  const currentAvailability =
    availability?.tripId === tripId &&
    availability.originCityId === originCityId &&
    availability.destinationCityId === destinationCityId
      ? availability
      : null;

  // Cantidad de asientos disponibles.
  const availableCount = currentAvailability?.seats.filter((seat) => seat.isAvailable).length ?? 0;

  // Pisos existentes en el bus.
  const floors = currentAvailability
    ? [...new Set(currentAvailability.seats.map((seat) => seat.floor))].sort((a, b) => a - b)
    : [];

  // Información de los asientos elegidos.
  const selectedSeats = currentAvailability
    ? currentAvailability.seats.filter(
        (seat) => seat.isAvailable && selectedSeatIds.has(seat.seatId),
      )
    : [];

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">TU VIAJE</p>
        <h1>Seleccionar asientos</h1>
        <p>Consulta y elige los asientos disponibles del viaje #{tripId}.</p>
      </header>

      <Link to="/pasajero/viajes">Volver a buscar viajes</Link>

      {/* Estado de carga */}
      {loading && <p role="status">Cargando asientos del viaje...</p>}

      {/* Mensajes de error */}
      {error && (
        <p role="alert" className="passenger-trip-search__error">
          {error}
        </p>
      )}

      {/* Distribución real del bus */}
      {currentAvailability && !loading && (
        <div className="passenger-trip-search__results">
          <h2>Distribución del bus</h2>

          <p>
            {currentAvailability.seats.length} asientos en total · {availableCount} disponibles
          </p>

          {/* Mostrar los pisos del bus */}
          {floors.map((floor) => {
            const floorSeats = currentAvailability.seats.filter((seat) => seat.floor === floor);

            const minRow = Math.min(...floorSeats.map((seat) => seat.row));
            const minColumn = Math.min(...floorSeats.map((seat) => seat.column));

            return (
              <section key={floor} style={{ marginTop: '1.5rem' }}>
                <h3>Piso {floor}</h3>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.max(
                      1,
                      currentAvailability.columns,
                    )}, minmax(52px, 1fr))`,
                    gap: '0.5rem',
                    maxWidth: '500px',
                    marginTop: '1rem',
                  }}
                >
                  {/* Asientos del piso */}
                  {floorSeats.map((seat) => {
                    const isSelected = selectedSeatIds.has(seat.seatId);

                    const selectionLimitReached = selectedSeatIds.size >= 10 && !isSelected;

                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        aria-label={`Asiento ${seat.number}, piso ${seat.floor}, ${
                          !seat.isAvailable ? 'ocupado' : isSelected ? 'seleccionado' : 'disponible'
                        }`}
                        aria-pressed={isSelected}
                        disabled={!seat.isAvailable || selectionLimitReached}
                        onClick={() => handleSeatClick(seat.seatId)}
                        style={{
                          gridColumn: seat.column - minColumn + 1,
                          gridRow: seat.row - minRow + 1,
                          border: isSelected ? '2px solid #2563eb' : '1px solid currentColor',
                          borderRadius: '8px',
                          padding: '0.6rem',
                          textAlign: 'center',
                          backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                          color: 'inherit',
                          cursor:
                            seat.isAvailable && !selectionLimitReached ? 'pointer' : 'not-allowed',
                          opacity: seat.isAvailable ? 1 : 0.45,
                        }}
                      >
                        <strong>{seat.number}</strong>

                        <div>{seat.seatType.toUpperCase()}</div>

                        <small>
                          {!seat.isAvailable ? 'Ocupado' : isSelected ? 'Elegido' : 'Libre'}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Mensaje cuando no hay asientos */}
          {currentAvailability.seats.length === 0 && (
            <p>No hay asientos configurados para este viaje.</p>
          )}

          {/* Resumen de la selección */}
          {currentAvailability.seats.length > 0 && (
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                border: '1px solid #d1d5db',
                borderRadius: '10px',
              }}
              aria-live="polite"
            >
              <h3>Tu selección</h3>

              <p>{selectedSeats.length} de 10 asientos como máximo.</p>

              {selectedSeats.length > 0 ? (
                <div>
                  <p>Asientos elegidos:</p>

                  <ul>
                    {selectedSeats.map((seat) => (
                      <li key={seat.seatId}>
                        Asiento {seat.number} · Piso {seat.floor} · {seat.seatType.toUpperCase()}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>Selecciona uno o varios asientos disponibles.</p>
              )}

              <p style={{ marginTop: '1rem' }}>
                La selección todavía no genera una reserva. En el siguiente paso ingresaremos los
                datos de los pasajeros.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
