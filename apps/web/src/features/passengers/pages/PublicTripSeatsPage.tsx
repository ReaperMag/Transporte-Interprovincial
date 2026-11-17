import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BusSeatMap } from '../../buses/components/BusSeatMap';
import type { BusTemplate } from '../../buses/types/busTemplate.types';
import { getTripSeats, type PublicTripSeatsResponse } from '../services/trip-seats.service';
import './PassengerTripSearchPage.css';
import './PassengerTripSeatsPage.css';

export function PublicTripSeatsPage() {
  const { tripId: tripIdParam } = useParams<{ tripId: string }>();
  const [params] = useSearchParams();
  const tripId = Number(tripIdParam);
  const originCityId = Number(params.get('origen'));
  const destinationCityId = Number(params.get('destino'));
  const validTrip =
    Number.isSafeInteger(tripId) &&
    tripId > 0 &&
    Number.isSafeInteger(originCityId) &&
    originCityId > 0 &&
    Number.isSafeInteger(destinationCityId) &&
    destinationCityId > 0 &&
    originCityId !== destinationCityId;

  const [result, setResult] = useState<{
    key: string;
    availability: PublicTripSeatsResponse | null;
    error: string | null;
  } | null>(null);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const requestKey = `${tripId}:${originCityId}:${destinationCityId}`;

  useEffect(() => {
    if (!validTrip) return;
    let active = true;
    void getTripSeats(tripId, originCityId, destinationCityId, true)
      .then((result) => {
        if (active) setResult({ key: requestKey, availability: result, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setResult({
            key: requestKey,
            availability: null,
            error: err instanceof Error ? err.message : 'No se pudieron consultar los asientos.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [validTrip, tripId, originCityId, destinationCityId, requestKey]);

  const availability = result?.key === requestKey ? result.availability : null;
  const error = result?.key === requestKey ? result.error : null;
  const current =
    availability?.tripId === tripId &&
    availability.originCityId === originCityId &&
    availability.destinationCityId === destinationCityId
      ? availability
      : null;
  const floors = current
    ? [...new Set(current.seats.map((seat) => seat.floor))].sort((a, b) => a - b)
    : [];
  const layout: BusTemplate = {
    id: `viaje-${tripId}`,
    name: `Bus del viaje ${tripId}`,
    floors: Math.max(1, floors.length),
    rows: current?.rows ?? 1,
    columns: current?.columns ?? 1,
    hasBathroom: false,
    seats: (current?.seats ?? []).map((seat) => ({
      id: String(seat.seatId),
      number: seat.number,
      floor: floors.indexOf(seat.floor) + 1,
      row: seat.row,
      column: seat.column,
      seatType: seat.seatType === 'vip' ? 'vip' : 'normal',
    })),
  };
  const unavailable = new Set(
    (current?.seats ?? []).filter((seat) => !seat.isAvailable).map((seat) => String(seat.seatId)),
  );
  const returnTo = `/pasajero/viajes/${tripId}/asientos?origen=${originCityId}&destino=${destinationCityId}`;

  return (
    <div className="public-dashboard">
      <section className="passenger-trip-search public-seat-preview">
        <header className="passenger-trip-search__header">
          <Link to="/viajes">← Volver a viajes disponibles</Link>
          <h1>Asientos y tarifas</h1>
          <p>Consulta la disponibilidad del viaje #{tripId} antes de reservar.</p>
        </header>
        {!validTrip && <p role="alert">Los datos del viaje o del tramo no son válidos.</p>}
        {validTrip && error && <p role="alert">{error}</p>}
        {validTrip && !current && !error && <p role="status">Cargando asientos del viaje...</p>}
        {current && (
          <div className="passenger-trip-search__card">
            <h2>Distribución del bus</h2>
            <p>
              {current.seats.length} asientos en total ·{' '}
              {current.seats.filter((seat) => seat.isAvailable).length} disponibles
            </p>
            <div className="passenger-trip-seats__legend" aria-label="Significado de los colores">
              <span className="passenger-trip-seats__legend-item">
                <i className="passenger-trip-seats__swatch" /> Disponible
              </span>
              <span className="passenger-trip-seats__legend-item">
                <i className="passenger-trip-seats__swatch passenger-trip-seats__swatch--vip" /> VIP
              </span>
              <span className="passenger-trip-seats__legend-item">
                <i className="passenger-trip-seats__swatch passenger-trip-seats__swatch--unavailable" />{' '}
                No disponible
              </span>
            </div>
            {current.seats.length > 0 ? (
              <BusSeatMap
                template={layout}
                selectedFloor={Math.min(selectedFloor, layout.floors)}
                selectedSeatIds={new Set()}
                unavailableSeatIds={unavailable}
                onFloorChange={setSelectedFloor}
                onToggleSeat={() => {}}
                readOnly
              />
            ) : (
              <p>No hay asientos configurados para este viaje.</p>
            )}
            <h2>Tarifas del tramo</h2>
            {current.fares.length ? (
              <ul>
                {current.fares.map((fare) => (
                  <li key={fare.seatType}>
                    {fare.seatType === 'vip' ? 'VIP' : 'Normal'}:{' '}
                    {new Intl.NumberFormat('es-EC', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(Number(fare.price))}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No hay tarifas configuradas para este tramo.</p>
            )}
            <p>Es necesario iniciar sesión para continuar con la reserva.</p>
            <Link
              className="public-home__primary passenger-trip-seats__login"
              to="/login"
              state={{ returnTo }}
            >
              Iniciar sesión
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
