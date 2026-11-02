import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getTripSeats, type TripSeatsResponse } from '../services/trip-seats.service';
import {
  createPassengerReservation,
  ReservationRequestError,
  type PassengerCategory,
  type ReservationCreate,
  type ReservationRead,
} from '../services/reservation.service';
import './PassengerTripSearchPage.css';

interface PassengerForm {
  idNumber: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  category: PassengerCategory;
}

const emptyPassenger: PassengerForm = {
  idNumber: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  phone: '',
  email: '',
  category: 'regular',
};

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  });
}

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

  const [availability, setAvailability] = useState<TripSeatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSeatIds, setSelectedSeatIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );

  const [passengerForms, setPassengerForms] = useState<Record<number, PassengerForm>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReservationRead | null>(null);

  // Consultar los asientos del viaje.
  useEffect(() => {
    if (!validTrip) return;

    let active = true;

    async function loadSeats() {
      setLoading(true);
      setError(null);
      setAvailability(null);
      setSelectedSeatIds(new Set<number>());
      setPassengerForms({});
      setSubmitError(null);
      setReservation(null);

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

  // Evitar mostrar datos de un viaje diferente.
  const currentAvailability =
    availability?.tripId === tripId &&
    availability.originCityId === originCityId &&
    availability.destinationCityId === destinationCityId
      ? availability
      : null;

  const availableCount = currentAvailability?.seats.filter((seat) => seat.isAvailable).length ?? 0;

  const floors = currentAvailability
    ? [...new Set(currentAvailability.seats.map((seat) => seat.floor))].sort((a, b) => a - b)
    : [];

  const selectedSeats = currentAvailability
    ? currentAvailability.seats.filter(
        (seat) => seat.isAvailable && selectedSeatIds.has(seat.seatId),
      )
    : [];

  // Seleccionar o deseleccionar un asiento.
  function handleSeatClick(seatId: number) {
    if (submitting || reservation) return;

    const seat = currentAvailability?.seats.find((item) => item.seatId === seatId);

    if (!seat || !seat.isAvailable) return;

    setSelectedSeatIds((current) => {
      const next = new Set(current);

      if (next.has(seatId)) {
        next.delete(seatId);
      } else if (next.size < 10) {
        next.add(seatId);
      }

      return next;
    });

    setSubmitError(null);
  }

  // Actualizar los datos de un pasajero.
  function updatePassengerField<K extends keyof PassengerForm>(
    seatId: number,
    field: K,
    value: PassengerForm[K],
  ) {
    setPassengerForms((current) => ({
      ...current,
      [seatId]: {
        ...(current[seatId] ?? emptyPassenger),
        [field]: value,
      },
    }));
  }

  // Crear la reserva utilizando el backend existente.
  async function handleCreateReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentAvailability || submitting || reservation) return;

    setSubmitError(null);

    if (selectedSeats.length < 1 || selectedSeats.length > 10) {
      setSubmitError('Debes seleccionar entre 1 y 10 asientos.');
      return;
    }

    const usedIds = new Set<string>();

    for (const seat of selectedSeats) {
      const passenger = passengerForms[seat.seatId] ?? emptyPassenger;

      const idNumber = passenger.idNumber.trim();
      const firstName = passenger.firstName.trim();
      const lastName = passenger.lastName.trim();

      if (
        idNumber.length < 5 ||
        idNumber.length > 13 ||
        firstName.length < 1 ||
        firstName.length > 100 ||
        lastName.length < 1 ||
        lastName.length > 100
      ) {
        setSubmitError(`Revisa la identificación, nombres y apellidos del asiento ${seat.number}.`);
        return;
      }

      const normalizedId = idNumber.toUpperCase();

      if (usedIds.has(normalizedId)) {
        setSubmitError('No puedes registrar la misma identificación en dos asientos.');
        return;
      }

      usedIds.add(normalizedId);
    }

    const payload: ReservationCreate = {
      tripId,
      originCityId,
      destinationCityId,
      seats: selectedSeats.map((seat) => {
        const passenger = passengerForms[seat.seatId] ?? emptyPassenger;

        return {
          seatId: seat.seatId,
          passenger: {
            idNumber: passenger.idNumber.trim(),
            firstName: passenger.firstName.trim(),
            lastName: passenger.lastName.trim(),
            birthDate: passenger.birthDate || null,
            phone: passenger.phone.trim() || null,
            email: passenger.email.trim() || null,
            category: passenger.category,
          },
        };
      }),
    };

    setSubmitting(true);

    try {
      const createdReservation = await createPassengerReservation(payload);
      setReservation(createdReservation);
    } catch (err) {
      if (err instanceof ReservationRequestError && err.status === 409) {
        setSelectedSeatIds(new Set<number>());
        setPassengerForms({});
        setAvailability(null);

        try {
          const updatedSeats = await getTripSeats(tripId, originCityId, destinationCityId);
          setAvailability(updatedSeats);
        } catch {
          setError('No se pudo actualizar la disponibilidad. Vuelve a buscar el viaje.');
        }
      }

      setSubmitError(err instanceof Error ? err.message : 'Ocurrió un error al crear la reserva.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!validTrip) {
    return (
      <section className="passenger-trip-search">
        <h1>Viaje no válido</h1>
        <p>No se recibió la información necesaria del viaje.</p>
        <Link to="/pasajero/viajes">Volver a buscar viajes</Link>
      </section>
    );
  }

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">TU VIAJE</p>
        <h1>Seleccionar asientos</h1>
        <p>Elige tus asientos e ingresa los datos de cada pasajero.</p>
      </header>

      <Link to="/pasajero/viajes">Volver a buscar viajes</Link>

      {loading && <p role="status">Cargando asientos del viaje...</p>}

      {error && (
        <p role="alert" className="passenger-trip-search__error">
          {error}
        </p>
      )}

      {/* Confirmación de la reserva */}
      {reservation && (
        <div className="passenger-trip-search__results" role="status">
          <h2>¡Reserva creada correctamente!</h2>

          <p>
            <strong>Número de reserva:</strong> {reservation.id}
          </p>

          <p>
            <strong>Estado:</strong> {reservation.status}
          </p>

          <p>
            <strong>Salida:</strong> {formatDate(reservation.departureAt)}
          </p>

          {reservation.expiresAt && (
            <p>
              <strong>La reserva vence:</strong> {formatDate(reservation.expiresAt)}
            </p>
          )}

          <h3>Asientos reservados</h3>

          <ul>
            {reservation.seats.map((seat) => (
              <li key={seat.seatId}>
                Asiento {seat.seatNumber} — {seat.passengerName} — {formatMoney(seat.price)}
              </li>
            ))}
          </ul>

          <h3>Total: {formatMoney(reservation.total)}</h3>

          <p>
            Los asientos han sido apartados según las condiciones del sistema. Esta confirmación no
            significa que el pago se haya realizado.
          </p>

          <Link to="/pasajero/viajes">Buscar otro viaje</Link>
        </div>
      )}

      {/* Distribución de los asientos */}
      {currentAvailability && !loading && !reservation && (
        <div className="passenger-trip-search__results">
          <h2>Distribución del bus</h2>

          <p>
            {currentAvailability.seats.length} asientos en total · {availableCount} disponibles
          </p>

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
                  {floorSeats.map((seat) => {
                    const isSelected = selectedSeatIds.has(seat.seatId);
                    const limitReached = selectedSeatIds.size >= 10 && !isSelected;

                    return (
                      <button
                        key={seat.seatId}
                        type="button"
                        aria-label={`Asiento ${seat.number}, piso ${seat.floor}, ${
                          !seat.isAvailable ? 'ocupado' : isSelected ? 'seleccionado' : 'disponible'
                        }`}
                        aria-pressed={isSelected}
                        disabled={!seat.isAvailable || limitReached || submitting}
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
                          cursor: seat.isAvailable && !limitReached ? 'pointer' : 'not-allowed',
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

          {currentAvailability.seats.length === 0 && (
            <p>No hay asientos configurados para este viaje.</p>
          )}

          {/* Resumen de selección */}
          {currentAvailability.seats.length > 0 && (
            <div style={{ marginTop: '1.5rem' }} aria-live="polite">
              <h3>Tu selección</h3>

              <p>{selectedSeats.length} de 10 asientos como máximo.</p>

              {selectedSeats.length > 0 ? (
                <ul>
                  {selectedSeats.map((seat) => (
                    <li key={seat.seatId}>
                      Asiento {seat.number} · Piso {seat.floor}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Selecciona uno o varios asientos disponibles.</p>
              )}
            </div>
          )}

          {/* Formulario de pasajeros */}
          {selectedSeats.length > 0 && (
            <form
              onSubmit={(event) => {
                void handleCreateReservation(event);
              }}
              style={{ marginTop: '2rem' }}
            >
              <h2>Datos de los pasajeros</h2>

              <p>Completa los datos de cada persona que ocupará los asientos seleccionados.</p>

              {selectedSeats.map((seat) => {
                const passenger = passengerForms[seat.seatId] ?? emptyPassenger;

                return (
                  <fieldset
                    key={seat.seatId}
                    disabled={submitting}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: '10px',
                      padding: '1.25rem',
                      marginTop: '1rem',
                    }}
                  >
                    <legend>
                      <strong>
                        Pasajero del asiento {seat.number} · Piso {seat.floor}
                      </strong>
                    </legend>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '1rem',
                      }}
                    >
                      <label>
                        Identificación *
                        <input
                          type="text"
                          required
                          minLength={5}
                          maxLength={13}
                          value={passenger.idNumber}
                          onChange={(event) =>
                            updatePassengerField(seat.seatId, 'idNumber', event.target.value)
                          }
                          style={{ display: 'block', width: '100%' }}
                        />
                      </label>

                      <label>
                        Nombres *
                        <input
                          type="text"
                          required
                          maxLength={100}
                          value={passenger.firstName}
                          onChange={(event) =>
                            updatePassengerField(seat.seatId, 'firstName', event.target.value)
                          }
                          style={{ display: 'block', width: '100%' }}
                        />
                      </label>

                      <label>
                        Apellidos *
                        <input
                          type="text"
                          required
                          maxLength={100}
                          value={passenger.lastName}
                          onChange={(event) =>
                            updatePassengerField(seat.seatId, 'lastName', event.target.value)
                          }
                          style={{ display: 'block', width: '100%' }}
                        />
                      </label>

                      <label>
                        Fecha de nacimiento
                        <input
                          type="date"
                          value={passenger.birthDate}
                          onChange={(event) =>
                            updatePassengerField(seat.seatId, 'birthDate', event.target.value)
                          }
                          style={{ display: 'block', width: '100%' }}
                        />
                      </label>

                      <label>
                        Teléfono
                        <input
                          type="tel"
                          maxLength={20}
                          value={passenger.phone}
                          onChange={(event) =>
                            updatePassengerField(seat.seatId, 'phone', event.target.value)
                          }
                          style={{ display: 'block', width: '100%' }}
                        />
                      </label>

                      <label>
                        Correo electrónico
                        <input
                          type="email"
                          maxLength={150}
                          value={passenger.email}
                          onChange={(event) =>
                            updatePassengerField(seat.seatId, 'email', event.target.value)
                          }
                          style={{ display: 'block', width: '100%' }}
                        />
                      </label>

                      <label>
                        Categoría del pasajero *
                        <select
                          required
                          value={passenger.category}
                          onChange={(event) =>
                            updatePassengerField(
                              seat.seatId,
                              'category',
                              event.target.value as PassengerCategory,
                            )
                          }
                          style={{ display: 'block', width: '100%' }}
                        >
                          <option value="regular">Regular</option>
                          <option value="minor">Menor de edad</option>
                          <option value="senior">Tercera edad</option>
                          <option value="disability">Persona con discapacidad</option>
                        </select>
                      </label>
                    </div>
                  </fieldset>
                );
              })}

              {submitError && (
                <p
                  role="alert"
                  className="passenger-trip-search__error"
                  style={{ marginTop: '1rem' }}
                >
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                className="passenger-trip-search__button"
                disabled={submitting}
                style={{ marginTop: '1.5rem' }}
              >
                {submitting ? 'Creando reserva...' : 'Confirmar reserva'}
              </button>

              <p style={{ marginTop: '1rem' }}>
                La reserva aparta temporalmente los asientos. El pago se realizará en un paso
                posterior.
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
