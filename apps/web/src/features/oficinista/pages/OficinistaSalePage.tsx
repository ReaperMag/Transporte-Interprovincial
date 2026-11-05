import { useEffect, useState, type FormEvent } from 'react';
import type {
  PassengerCategory,
  ReservationRead,
} from '../../passengers/services/reservation.service';
import type { TripCity, TripSearchResult } from '../../passengers/services/trip.service';
import type { TripSeatsResponse } from '../../passengers/services/trip-seats.service';
import type { TicketRead } from '../../passengers/services/ticket.service';
import {
  chargeOfficeReservation,
  createOfficeReservation,
  getOfficeReservationTickets,
  getOfficeTripCities,
  getOfficeTripSeats,
  searchOfficeTrips,
} from '../services/oficinista.service';
import './OficinistaOperationsPage.css';

interface PassengerDetails {
  idNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  category: PassengerCategory;
}

const emptyPassenger: PassengerDetails = {
  idNumber: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  category: 'regular',
};

function todayInEcuador(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatDeparture(value: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  }).format(new Date(value));
}

export function OficinistaSalePage() {
  const today = todayInEcuador();
  const [cities, setCities] = useState<TripCity[]>([]);
  const [originCityId, setOriginCityId] = useState('');
  const [destinationCityId, setDestinationCityId] = useState('');
  const [travelDate, setTravelDate] = useState(today);
  const [trips, setTrips] = useState<TripSearchResult[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripSearchResult | null>(null);
  const [availability, setAvailability] = useState<TripSeatsResponse | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null);
  const [passenger, setPassenger] = useState<PassengerDetails>(emptyPassenger);
  const [reservation, setReservation] = useState<ReservationRead | null>(null);
  const [tickets, setTickets] = useState<TicketRead[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [processingSale, setProcessingSale] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOfficeTripCities()
      .then((result) => {
        if (active) setCities(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar las ciudades de la cooperativa.',
          );
        }
      })
      .finally(() => {
        if (active) setLoadingCities(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedSeat = availability?.seats.find((seat) => seat.seatId === selectedSeatId) ?? null;

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setTrips([]);
    setSelectedTrip(null);
    setAvailability(null);
    setSelectedSeatId(null);
    setReservation(null);
    setTickets([]);
    setPaymentComplete(false);
    if (!originCityId || !destinationCityId || originCityId === destinationCityId) {
      setError('Selecciona ciudades diferentes para el origen y el destino.');
      return;
    }
    setSearching(true);
    try {
      setTrips(
        await searchOfficeTrips({
          originCityId: Number(originCityId),
          destinationCityId: Number(destinationCityId),
          travelDate,
        }),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudieron buscar los viajes.',
      );
    } finally {
      setSearching(false);
    }
  };

  const handleSelectTrip = async (trip: TripSearchResult) => {
    setSelectedTrip(trip);
    setAvailability(null);
    setSelectedSeatId(null);
    setReservation(null);
    setTickets([]);
    setPaymentComplete(false);
    setError(null);
    setLoadingSeats(true);
    try {
      setAvailability(
        await getOfficeTripSeats(trip.tripId, trip.originCityId, trip.destinationCityId),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo consultar la disponibilidad del bus.',
      );
    } finally {
      setLoadingSeats(false);
    }
  };

  const handlePassengerChange = (field: keyof PassengerDetails, value: string) => {
    setPassenger((current) => ({ ...current, [field]: value }));
  };

  const handleSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTrip || !selectedSeat || !availability) return;
    setProcessingSale(true);
    setError(null);
    setNotice(null);
    try {
      let activeReservation = reservation;
      if (!activeReservation) {
        activeReservation = await createOfficeReservation({
          tripId: selectedTrip.tripId,
          originCityId: selectedTrip.originCityId,
          destinationCityId: selectedTrip.destinationCityId,
          seats: [
            {
              seatId: selectedSeat.seatId,
              passenger: {
                idNumber: passenger.idNumber.trim(),
                firstName: passenger.firstName.trim(),
                lastName: passenger.lastName.trim(),
                phone: passenger.phone.trim() || null,
                email: passenger.email.trim() || null,
                category: passenger.category,
              },
            },
          ],
        });
        setReservation(activeReservation);
      }
      if (!paymentComplete) {
        await chargeOfficeReservation(activeReservation.id);
        setPaymentComplete(true);
      }
      setTickets(await getOfficeReservationTickets(activeReservation.id));
      setNotice(`Venta completada para la reserva #${activeReservation.id}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo completar la venta.',
      );
    } finally {
      setProcessingSale(false);
    }
  };

  const handleNewSale = () => {
    setSelectedTrip(null);
    setAvailability(null);
    setSelectedSeatId(null);
    setPassenger(emptyPassenger);
    setReservation(null);
    setTickets([]);
    setPaymentComplete(false);
    setError(null);
    setNotice(null);
  };

  return (
    <section className="oficinista-operations" aria-labelledby="office-sale-title">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">Venta en oficina</p>
        <h1 id="office-sale-title">Vender un boleto</h1>
        <p>
          Busca un viaje de tu cooperativa, selecciona un asiento y registra el cobro en efectivo.
        </p>
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

      {tickets.length > 0 ? (
        <section className="oficinista-operations__card">
          <div className="oficinista-operations__card-heading">
            <div>
              <h2>Boletos emitidos</h2>
              <p>Reserva #{reservation?.id} · Pago confirmado</p>
            </div>
            <button
              type="button"
              className="oficinista-operations__button--secondary"
              onClick={handleNewSale}
            >
              Nueva venta
            </button>
          </div>
          <div className="oficinista-operations__list">
            {tickets.map((ticket) => (
              <article className="oficinista-operations__item" key={ticket.id}>
                <h3>Boleto {ticket.code}</h3>
                <p>
                  {ticket.passengerName} · Cédula {ticket.passengerIdNumber}
                </p>
                <p>
                  {ticket.originCityName} → {ticket.destinationCityName}
                </p>
                <p>
                  Asiento {ticket.seatNumber} · Salida {formatDeparture(ticket.departureAt)}
                </p>
                <strong>{formatMoney(ticket.price)}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : paymentComplete && reservation ? (
        <section className="oficinista-operations__card">
          <h2>Pago confirmado</h2>
          <p>
            La reserva #{reservation.id} fue cobrada. No se pudieron cargar los boletos en este
            momento.
          </p>
          <button
            type="button"
            className="oficinista-operations__button"
            disabled={processingSale}
            onClick={() => {
              setProcessingSale(true);
              void getOfficeReservationTickets(reservation.id)
                .then(setTickets)
                .catch((requestError: unknown) =>
                  setError(
                    requestError instanceof Error
                      ? requestError.message
                      : 'No se pudieron cargar los boletos.',
                  ),
                )
                .finally(() => setProcessingSale(false));
            }}
          >
            {processingSale ? 'Consultando...' : 'Consultar boletos emitidos'}
          </button>
        </section>
      ) : (
        <>
          <section className="oficinista-operations__card">
            <h2>Buscar viajes disponibles</h2>
            <form
              className="oficinista-operations__form"
              onSubmit={(event) => void handleSearch(event)}
            >
              <label>
                Ciudad de origen
                <select
                  value={originCityId}
                  onChange={(event) => setOriginCityId(event.target.value)}
                  disabled={loadingCities || searching}
                  required
                >
                  <option value="">Selecciona el origen</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name} · {city.province}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ciudad de destino
                <select
                  value={destinationCityId}
                  onChange={(event) => setDestinationCityId(event.target.value)}
                  disabled={loadingCities || searching}
                  required
                >
                  <option value="">Selecciona el destino</option>
                  {cities
                    .filter((city) => String(city.id) !== originCityId)
                    .map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.name} · {city.province}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Fecha de viaje
                <input
                  type="date"
                  min={today}
                  value={travelDate}
                  onChange={(event) => setTravelDate(event.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={loadingCities || searching || cities.length < 2}>
                {searching ? 'Buscando...' : 'Buscar viajes'}
              </button>
            </form>

            {loadingCities && <p role="status">Cargando rutas de la cooperativa...</p>}
            {!loadingCities && cities.length < 2 && (
              <p className="oficinista-operations__empty">
                La cooperativa aún no tiene rutas disponibles para la venta.
              </p>
            )}
            {trips.length > 0 && (
              <div className="oficinista-operations__list">
                {trips.map((trip) => (
                  <article className="oficinista-operations__item" key={trip.tripId}>
                    <div className="oficinista-operations__item-heading">
                      <div>
                        <h3>
                          {trip.originCityName} → {trip.destinationCityName}
                        </h3>
                        <p>
                          Viaje #{trip.tripId} · {formatDeparture(trip.departureAt)} · Bus{' '}
                          {trip.busNumber}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="oficinista-operations__button"
                        onClick={() => void handleSelectTrip(trip)}
                        disabled={loadingSeats}
                      >
                        {loadingSeats && selectedTrip?.tripId === trip.tripId
                          ? 'Cargando...'
                          : 'Seleccionar viaje'}
                      </button>
                    </div>
                    <p className="oficinista-operations__fare-list">
                      {trip.fares.map((fare) => (
                        <span key={fare.seatType}>
                          {fare.seatType === 'vip' ? 'VIP' : 'Normal'}: {formatMoney(fare.price)}
                        </span>
                      ))}
                    </p>
                  </article>
                ))}
              </div>
            )}
            {!searching && trips.length === 0 && !loadingCities && (
              <p className="oficinista-operations__empty">
                Busca una fecha y un tramo para ver las salidas disponibles.
              </p>
            )}
          </section>

          {selectedTrip && (
            <section className="oficinista-operations__card">
              <div className="oficinista-operations__card-heading">
                <div>
                  <h2>Asientos disponibles</h2>
                  <p>
                    {selectedTrip.originCityName} → {selectedTrip.destinationCityName} · Viaje #
                    {selectedTrip.tripId}
                  </p>
                </div>
                <button
                  type="button"
                  className="oficinista-operations__button--secondary"
                  onClick={() => setSelectedTrip(null)}
                >
                  Cambiar viaje
                </button>
              </div>

              {loadingSeats && <p role="status">Consultando asientos...</p>}
              {availability && (
                <>
                  <div
                    className="oficinista-operations__seat-grid"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(1, availability.columns)}, minmax(54px, 1fr))`,
                    }}
                    aria-label="Asientos del bus"
                  >
                    {availability.seats.map((seat) => {
                      const selected = seat.seatId === selectedSeatId;
                      return (
                        <button
                          key={seat.seatId}
                          type="button"
                          aria-pressed={selected}
                          aria-label={`Asiento ${seat.number}, piso ${seat.floor}, ${seat.isAvailable ? 'disponible' : 'ocupado'}`}
                          disabled={!seat.isAvailable || processingSale || paymentComplete}
                          onClick={() => setSelectedSeatId(selected ? null : seat.seatId)}
                          className={`oficinista-operations__seat${selected ? ' oficinista-operations__seat--selected' : ''}`}
                          style={{
                            gridColumn: seat.column,
                            gridRow: seat.row + (seat.floor - 1) * availability.rows,
                          }}
                        >
                          {seat.number}
                          <small>{seat.seatType === 'vip' ? 'VIP' : 'Normal'}</small>
                        </button>
                      );
                    })}
                  </div>
                  {availability.seats.length === 0 && (
                    <p>No hay asientos configurados para este bus.</p>
                  )}
                </>
              )}
            </section>
          )}

          {selectedTrip && selectedSeat && !paymentComplete && (
            <section className="oficinista-operations__card">
              <h2>Datos del pasajero y cobro</h2>
              <p>
                Asiento {selectedSeat.number} · {selectedSeat.seatType === 'vip' ? 'VIP' : 'Normal'}
              </p>
              <form
                className="oficinista-operations__form"
                onSubmit={(event) => void handleSale(event)}
              >
                <label>
                  Cédula o identificación
                  <input
                    value={passenger.idNumber}
                    onChange={(event) => handlePassengerChange('idNumber', event.target.value)}
                    minLength={5}
                    maxLength={13}
                    required
                    disabled={processingSale || Boolean(reservation)}
                  />
                </label>
                <label>
                  Nombres
                  <input
                    value={passenger.firstName}
                    onChange={(event) => handlePassengerChange('firstName', event.target.value)}
                    maxLength={100}
                    required
                    disabled={processingSale || Boolean(reservation)}
                  />
                </label>
                <label>
                  Apellidos
                  <input
                    value={passenger.lastName}
                    onChange={(event) => handlePassengerChange('lastName', event.target.value)}
                    maxLength={100}
                    required
                    disabled={processingSale || Boolean(reservation)}
                  />
                </label>
                <label>
                  Categoría
                  <select
                    value={passenger.category}
                    onChange={(event) =>
                      handlePassengerChange('category', event.target.value as PassengerCategory)
                    }
                    disabled={processingSale || Boolean(reservation)}
                  >
                    <option value="regular">Regular</option>
                    <option value="minor">Menor de edad</option>
                    <option value="senior">Tercera edad</option>
                    <option value="disability">Persona con discapacidad</option>
                  </select>
                </label>
                <label>
                  Teléfono (opcional)
                  <input
                    value={passenger.phone}
                    onChange={(event) => handlePassengerChange('phone', event.target.value)}
                    maxLength={20}
                    disabled={processingSale || Boolean(reservation)}
                  />
                </label>
                <label>
                  Correo (opcional)
                  <input
                    type="email"
                    value={passenger.email}
                    onChange={(event) => handlePassengerChange('email', event.target.value)}
                    maxLength={150}
                    disabled={processingSale || Boolean(reservation)}
                  />
                </label>
                <p className="oficinista-operations__total">
                  Total:{' '}
                  {formatMoney(
                    reservation?.total ??
                      selectedTrip.fares.find((fare) => fare.seatType === selectedSeat.seatType)
                        ?.price ??
                      0,
                  )}
                  {passenger.category !== 'regular' &&
                    !reservation &&
                    ' · El descuento se calculará al registrar la reserva'}
                </p>
                {reservation && !paymentComplete ? (
                  <button type="submit" disabled={processingSale}>
                    {processingSale ? 'Registrando cobro...' : 'Reintentar cobro en efectivo'}
                  </button>
                ) : (
                  <button type="submit" disabled={processingSale || paymentComplete}>
                    {processingSale
                      ? 'Procesando venta...'
                      : 'Confirmar venta y cobrar en efectivo'}
                  </button>
                )}
              </form>
            </section>
          )}
        </>
      )}
    </section>
  );
}
