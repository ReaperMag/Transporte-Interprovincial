import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BusSeatMap } from '../../buses/components/BusSeatMap';
import '../../buses/components/TransportTheme.css';
import type { BusTemplate } from '../../buses/types/busTemplate.types';
import { getTripSeats, type TripSeatsResponse } from '../services/trip-seats.service';
import './PassengerTripSeatsPage.css';
import {
  createPassengerReservation,
  ReservationRequestError,
  type PassengerCategory,
  type ReservationCreate,
  type ReservationRead,
} from '../services/reservation.service';
import { confirmPassengerPayment } from '../services/payment.service';
import {
  cedulaError,
  cleanName,
  cleanPhone,
  emailError,
  nameError,
  onlyDigits,
  phoneError,
} from '../../../shared/utils/validation';
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
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReservationRead | null>(null);
  const [isPurchased, setIsPurchased] = useState(false);

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
      setIsPurchased(false);

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

  // El mapa visual del bus usa la misma forma que las plantillas de la cooperativa.
  const busLayout: BusTemplate = {
    id: `viaje-${tripId}`,
    name: `Bus del viaje ${tripId}`,
    floors: Math.max(1, floors.length),
    hasBathroom: false,
    rows: currentAvailability?.rows ?? 1,
    columns: currentAvailability?.columns ?? 1,
    seats: (currentAvailability?.seats ?? []).map((seat) => ({
      id: String(seat.seatId),
      number: seat.number,
      floor: floors.indexOf(seat.floor) + 1,
      row: seat.row,
      column: seat.column,
      seatType: seat.seatType === 'vip' ? 'vip' : 'normal',
    })),
  };
  const visibleFloor = Math.min(selectedFloor, busLayout.floors);
  const selectedLayoutIds = new Set([...selectedSeatIds].map(String));
  const unavailableLayoutIds = new Set(
    (currentAvailability?.seats ?? [])
      .filter((seat) => !seat.isAvailable)
      .map((seat) => String(seat.seatId)),
  );

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

  // Procesar reserva o compra directa del boleto.
  async function handleProcessReservation(mode: 'reserve' | 'buy') {
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

      const validationError =
        cedulaError(idNumber) ??
        nameError(firstName) ??
        nameError(lastName) ??
        phoneError(passenger.phone) ??
        emailError(passenger.email, false);
      if (validationError) {
        setSubmitError(`Asiento ${seat.number}: ${validationError}`);
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

      if (mode === 'buy') {
        // Confirmar la reserva y emitir los boletos de inmediato
        await confirmPassengerPayment(createdReservation.id);
        setReservation({ ...createdReservation, status: 'confirmed' });
        setIsPurchased(true);
      } else {
        setReservation(createdReservation);
        setIsPurchased(false);
      }
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

      setSubmitError(
        err instanceof Error ? err.message : 'Ocurrió un error al procesar tu solicitud.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!validTrip) {
    return (
      <section className="passenger-trip-search">
        <h1>Viaje no válido</h1>
        <p>No se recibió la información necesaria del viaje.</p>
        <Link to="/pasajero">Volver a buscar viajes</Link>
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

      <Link to="/pasajero">Volver a buscar viajes</Link>

      {loading && <p role="status">Cargando asientos del viaje...</p>}

      {error && (
        <p role="alert" className="passenger-trip-search__error">
          {error}
        </p>
      )}

      {/* Confirmación de la compra o reserva */}
      {reservation && (
        <div className="passenger-trip-search__results" role="status">
          {isPurchased ? (
            <div
              style={{
                background: '#e6f4ea',
                border: '1px solid #34a853',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ color: '#137333', margin: '0 0 10px' }}>
                🎉 ¡Boleto confirmado y emitido con éxito!
              </h2>
              <p style={{ fontSize: '1rem', color: '#1e4620', margin: '0 0 14px' }}>
                Tu compra ha sido procesada correctamente.
              </p>

              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '16px',
                  border: '1px solid #ceead6',
                  margin: '14px 0',
                }}
              >
                <p style={{ margin: '0 0 6px', fontWeight: 'bold', color: '#0e5a6b' }}>
                  📧 Te hemos enviado el boleto con su código QR directamente a tu correo electrónico.
                </p>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563' }}>
                  Revisa tu bandeja de entrada para tenerlo listo al momento de abordar el bus.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
                <Link
                  to="/pasajero/boletos"
                  className="passenger-trip-search__button"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  Ver mis boletos y código QR
                </Link>
                <Link
                  to="/pasajero"
                  className="passenger-trip-search__button passenger-trip-search__button--secondary"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  Volver al panel principal
                </Link>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#fff9e6',
                border: '1px solid #ffd566',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ color: '#79560f', margin: '0 0 10px' }}>¡Reserva creada correctamente!</h2>
              <p style={{ fontSize: '0.95rem', color: '#55421a', margin: '0 0 14px' }}>
                Tus asientos han sido apartados temporalmente. Para confirmar tu viaje y emitir tus
                boletos, realiza el pago antes del vencimiento.
              </p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                <Link
                  to={`/pasajero/reservas/${reservation.id}/pago`}
                  className="passenger-trip-search__button"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  Continuar al pago de la reserva
                </Link>
                <Link
                  to="/pasajero/reservas"
                  className="passenger-trip-search__button passenger-trip-search__button--secondary"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  Ir a Mis Reservas
                </Link>
              </div>
            </div>
          )}

          <p>
            <strong>Número de reserva:</strong> #{reservation.id}
          </p>

          <p>
            <strong>Salida:</strong> {formatDate(reservation.departureAt)}
          </p>

          {reservation.expiresAt && !isPurchased && (
            <p>
              <strong>La reserva vence:</strong> {formatDate(reservation.expiresAt)}
            </p>
          )}

          <h3>Asientos {isPurchased ? 'adquiridos' : 'reservados'}</h3>

          <ul>
            {reservation.seats.map((seat) => (
              <li key={seat.seatId}>
                Asiento {seat.seatNumber} — {seat.passengerName} — {formatMoney(seat.price)}
              </li>
            ))}
          </ul>

          <h3>Total: {formatMoney(reservation.total)}</h3>

          <Link to="/pasajero">Volver a las rutas</Link>
        </div>
      )}

      {/* Distribución de los asientos */}
      {currentAvailability && !loading && !reservation && (
        <div className="passenger-trip-search__results">
          <h2>Distribución del bus</h2>

          <p>
            {currentAvailability.seats.length} asientos en total · {availableCount} disponibles
          </p>

          <div className="passenger-trip-seats__legend" aria-label="Significado de los colores">
            <span className="passenger-trip-seats__legend-item">
              <i className="passenger-trip-seats__swatch" /> Libre
            </span>
            <span className="passenger-trip-seats__legend-item">
              <i className="passenger-trip-seats__swatch passenger-trip-seats__swatch--vip" /> VIP
            </span>
            <span className="passenger-trip-seats__legend-item">
              <i className="passenger-trip-seats__swatch passenger-trip-seats__swatch--selected" />{' '}
              Elegido
            </span>
            <span className="passenger-trip-seats__legend-item">
              <i className="passenger-trip-seats__swatch passenger-trip-seats__swatch--unavailable" />{' '}
              Ocupado
            </span>
          </div>

          <BusSeatMap
            template={busLayout}
            selectedFloor={visibleFloor}
            selectedSeatIds={selectedLayoutIds}
            unavailableSeatIds={unavailableLayoutIds}
            isSeatDisabled={() => submitting || Boolean(reservation) || selectedSeatIds.size >= 10}
            onFloorChange={setSelectedFloor}
            onToggleSeat={(seat) => handleSeatClick(Number(seat.id))}
          />

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
                event.preventDefault();
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
                        Cédula *
                        <input
                          type="text"
                          inputMode="numeric"
                          required
                          minLength={10}
                          maxLength={10}
                          value={passenger.idNumber}
                          onChange={(event) =>
                            updatePassengerField(
                              seat.seatId,
                              'idNumber',
                              onlyDigits(event.target.value, 10),
                            )
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
                            updatePassengerField(
                              seat.seatId,
                              'firstName',
                              cleanName(event.target.value),
                            )
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
                            updatePassengerField(
                              seat.seatId,
                              'lastName',
                              cleanName(event.target.value),
                            )
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
                            updatePassengerField(
                              seat.seatId,
                              'phone',
                              cleanPhone(event.target.value),
                            )
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

              {/* Botones de acción: Reservar o Comprar */}
              <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="passenger-trip-search__button passenger-trip-search__button--secondary"
                  disabled={submitting}
                  onClick={() => handleProcessReservation('reserve')}
                >
                  {submitting ? 'Procesando...' : 'Reservar'}
                </button>
                <button
                  type="button"
                  className="passenger-trip-search__button"
                  disabled={submitting}
                  onClick={() => handleProcessReservation('buy')}
                >
                  {submitting ? 'Procesando...' : 'Comprar'}
                </button>
              </div>

              <p style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "#6b7280" }}>
                <strong>Reservar:</strong> aparta los asientos temporalmente y paga después.
                <br />
                <strong>Comprar:</strong> confirma el pago y emite tus boletos de inmediato.
              </p>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
