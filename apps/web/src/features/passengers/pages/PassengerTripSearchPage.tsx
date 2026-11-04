import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getTripCities,
  searchPassengerTrips,
  type TripCity,
  type TripSearchResult,
} from '../services/trip.service';
import './PassengerTripSearchPage.css';

function getTodayInEcuador(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

function formatDeparture(value: string): string {
  // Si el backend devuelve una fecha sin zona horaria,
  // mostramos directamente su fecha y hora registradas.
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);

  if (!hasTimezone) {
    const [date, time] = value.split('T');

    if (date && time) {
      const [year, month, day] = date.split('-');
      return `${day}/${month}/${year} · ${time.slice(0, 5)}`;
    }

    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) {
    return 'No especificada';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  return remainingMinutes > 0 ? `${hours} h ${remainingMinutes} min` : `${hours} h`;
}

function formatPrice(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatSeatType(value: string): string {
  if (value === 'vip') return 'VIP';
  if (value === 'normal') return 'Normal';
  return value;
}

export function PassengerTripSearchPage() {
  const [cities, setCities] = useState<TripCity[]>([]);
  const [originCityId, setOriginCityId] = useState('');
  const [destinationCityId, setDestinationCityId] = useState('');
  const [travelDate, setTravelDate] = useState(getTodayInEcuador);

  const [trips, setTrips] = useState<TripSearchResult[]>([]);
  const [loadingCities, setLoadingCities] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const today = getTodayInEcuador();

  useEffect(() => {
    let active = true;

    async function loadCities() {
      try {
        const result = await getTripCities();

        if (active) {
          setCities(result);
        }
      } catch (error) {
        if (active) {
          setCitiesError(
            error instanceof Error ? error.message : 'Ocurrió un error al cargar las ciudades.',
          );
        }
      } finally {
        if (active) {
          setLoadingCities(false);
        }
      }
    }

    void loadCities();

    return () => {
      active = false;
    };
  }, []);

  function clearResults() {
    setTrips([]);
    setHasSearched(false);
    setSearchError(null);
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearResults();

    if (!originCityId || !destinationCityId || !travelDate) {
      setSearchError('Selecciona el origen, destino y fecha del viaje.');
      return;
    }

    if (originCityId === destinationCityId) {
      setSearchError('El origen y el destino deben ser diferentes.');
      return;
    }

    if (travelDate < today) {
      setSearchError('Selecciona una fecha actual o futura.');
      return;
    }

    setLoadingTrips(true);

    try {
      const result = await searchPassengerTrips({
        originCityId: Number(originCityId),
        destinationCityId: Number(destinationCityId),
        travelDate,
      });

      setTrips(result);
      setHasSearched(true);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Ocurrió un error al buscar viajes.');
    } finally {
      setLoadingTrips(false);
    }
  }

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">PLANIFICA TU VIAJE</p>
        <h1>Buscar viajes</h1>
        <p>
          Selecciona tu ciudad de origen, destino y fecha para consultar las salidas disponibles.
        </p>
      </header>

      <form className="passenger-trip-search__form" onSubmit={(event) => void handleSearch(event)}>
        <div className="passenger-trip-search__fields">
          <label className="passenger-trip-search__field">
            <span>Ciudad de origen</span>
            <select
              value={originCityId}
              onChange={(event) => {
                const value = event.target.value;
                setOriginCityId(value);

                if (value === destinationCityId) {
                  setDestinationCityId('');
                }

                clearResults();
              }}
              disabled={loadingCities || loadingTrips}
              required
            >
              <option value="">Selecciona el origen</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name} - {city.province}
                </option>
              ))}
            </select>
          </label>

          <label className="passenger-trip-search__field">
            <span>Ciudad de destino</span>
            <select
              value={destinationCityId}
              onChange={(event) => {
                setDestinationCityId(event.target.value);
                clearResults();
              }}
              disabled={loadingCities || loadingTrips}
              required
            >
              <option value="">Selecciona el destino</option>
              {cities
                .filter((city) => String(city.id) !== originCityId)
                .map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} - {city.province}
                  </option>
                ))}
            </select>
          </label>

          <label className="passenger-trip-search__field">
            <span>Fecha de viaje</span>
            <input
              type="date"
              min={today}
              value={travelDate}
              onChange={(event) => {
                setTravelDate(event.target.value);
                clearResults();
              }}
              disabled={loadingTrips}
              required
            />
          </label>
        </div>

        {citiesError && (
          <p role="alert" className="passenger-trip-search__error">
            {citiesError}
          </p>
        )}

        {!loadingCities && !citiesError && cities.length < 2 && (
          <p className="passenger-trip-search__notice">
            Se necesitan al menos dos ciudades registradas para realizar una búsqueda.
          </p>
        )}

        <button
          className="passenger-trip-search__button"
          type="submit"
          disabled={loadingCities || loadingTrips || cities.length < 2}
        >
          {loadingTrips ? 'Buscando viajes...' : 'Buscar viajes'}
        </button>
      </form>

      {loadingCities && <p role="status">Cargando ciudades...</p>}

      {searchError && (
        <p role="alert" className="passenger-trip-search__error">
          {searchError}
        </p>
      )}

      {loadingTrips && <p role="status">Consultando viajes disponibles...</p>}

      {hasSearched && !loadingTrips && (
        <div className="passenger-trip-search__results">
          <h2>Resultados de la búsqueda</h2>

          {trips.length === 0 ? (
            <div className="passenger-trip-search__empty">
              <h3>No se encontraron viajes</h3>
              <p>
                No hay salidas disponibles para el origen, destino y fecha seleccionados. Prueba con
                otra fecha.
              </p>
            </div>
          ) : (
            <div className="passenger-trip-search__list">
              {trips.map((trip) => (
                <article className="passenger-trip-search__card" key={trip.tripId}>
                  <div className="passenger-trip-search__card-header">
                    <div>
                      <span className="passenger-trip-search__caption">COOPERATIVA</span>
                      <h3>{trip.cooperativeName}</h3>
                    </div>
                    <span className="passenger-trip-search__trip-id">Viaje #{trip.tripId}</span>
                  </div>

                  <p className="passenger-trip-search__route">
                    {trip.originCityName}
                    <span aria-hidden="true"> → </span>
                    {trip.destinationCityName}
                  </p>

                  <div className="passenger-trip-search__details">
                    <div>
                      <span>Salida</span>
                      <strong>{formatDeparture(trip.departureAt)}</strong>
                    </div>

                    <div>
                      <span>Duración estimada</span>
                      <strong>{formatDuration(trip.durationMinutes)}</strong>
                    </div>

                    <div>
                      <span>Bus</span>
                      <strong>{trip.busNumber}</strong>
                    </div>
                  </div>

                  <div className="passenger-trip-search__fares">
                    <span>Tarifas base</span>
                    <div className="passenger-trip-search__fare-list">
                      {trip.fares.map((fare) => (
                        <span className="passenger-trip-search__fare" key={fare.seatType}>
                          {formatSeatType(fare.seatType)}:{' '}
                          <strong>{formatPrice(fare.price)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link
                    className="passenger-trip-search__button"
                    to={`/pasajero/viajes/${trip.tripId}/asientos?origen=${trip.originCityId}&destino=${trip.destinationCityId}`}
                    style={{
                      display: 'inline-block',
                      marginTop: '1rem',
                      textDecoration: 'none',
                    }}
                  >
                    Seleccionar asientos
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
