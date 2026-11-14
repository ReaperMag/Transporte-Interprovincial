import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPassengerProfile, type PassengerProfile } from '../services/passenger.service';
import {
  HISTORICAL_LOCATION_GROUP,
  normalizeGeographicSearch,
  PassengerLocationFilter,
  type PassengerCanton,
  type SearchLocation,
} from '../components/PassengerLocationFilter';
import {
  getTripCities,
  searchPassengerTrips,
  type TripCity,
  type TripSearchResult,
} from '../services/trip.service';
import './PassengerDashboardPage.css';

interface DayTab {
  dateString: string;
  dayName: string;
  formattedDate: string;
}

function getEcuadorDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}-${month}-${day}`;
}

function generateNextSevenDays(): DayTab[] {
  const days: DayTab[] = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const target = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const dateString = getEcuadorDateString(target);

    let dayName = '';
    if (i === 0) dayName = 'Hoy';
    else if (i === 1) dayName = 'Mañana';
    else {
      const name = target.toLocaleDateString('es-EC', {
        weekday: 'short',
        timeZone: 'America/Guayaquil',
      });
      dayName = name.charAt(0).toUpperCase() + name.slice(1);
    }

    const formattedDate = target.toLocaleDateString('es-EC', {
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Guayaquil',
    });

    days.push({
      dateString,
      dayName,
      formattedDate,
    });
  }

  return days;
}

function formatDeparture(value: string): string {
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
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('es-EC', {
    timeZone: 'America/Guayaquil',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'No especificada';
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours === 0) return `${remaining} min`;
  return remaining > 0 ? `${hours} h ${remaining} min` : `${hours} h`;
}

function formatPrice(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function isTripPast(trip: TripSearchResult): boolean {
  if (trip.isPast !== undefined) return trip.isPast;
  const parsed = new Date(trip.departureAt).getTime();
  return !Number.isNaN(parsed) && parsed <= Date.now();
}

export function PassengerDashboardPage() {
  const [profile, setProfile] = useState<PassengerProfile | null>(null);
  const [cities, setCities] = useState<TripCity[]>([]);
  const [trips, setTrips] = useState<TripSearchResult[]>([]);

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [isLoadingCities, setIsLoadingCities] = useState(true);
  const [isLoadingTrips, setIsLoadingTrips] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [tripsError, setTripsError] = useState<string | null>(null);

  const nextSevenDays = useMemo(() => generateNextSevenDays(), []);
  const [selectedDay, setSelectedDay] = useState<string>(() => nextSevenDays[0]?.dateString ?? '');
  const [originCityId, setOriginCityId] = useState('');
  const [destinationCityId, setDestinationCityId] = useState('');
  const [originProvince, setOriginProvince] = useState('');
  const [originCanton, setOriginCanton] = useState('');
  const [originSearch, setOriginSearch] = useState('');
  const [destinationProvince, setDestinationProvince] = useState('');
  const [destinationCanton, setDestinationCanton] = useState('');
  const [destinationSearch, setDestinationSearch] = useState('');

  const provinces = useMemo(
    () =>
      [...new Set(cities.map((city) => city.province))].sort((a, b) => a.localeCompare(b, 'es')),
    [cities],
  );
  const cantons = useMemo(() => {
    const options = new Map<string, PassengerCanton>();
    for (const city of cities) {
      if (!city.canton) continue;
      const key = `${city.province}:${city.canton}`;
      options.set(key, { id: key, name: city.canton, province: city.province });
    }
    return [...options.values()].sort(
      (left, right) =>
        left.province.localeCompare(right.province, 'es') ||
        left.name.localeCompare(right.name, 'es'),
    );
  }, [cities]);
  const selectableCities = useMemo(() => {
    const knownCantons = new Set(
      cantons.map(
        (canton) =>
          `${normalizeGeographicSearch(canton.province)}:${normalizeGeographicSearch(canton.name)}`,
      ),
    );
    return cities.map((city) => ({
      ...city,
      parentCanton: city.canton
        ? city.canton
        : knownCantons.has(
              `${normalizeGeographicSearch(city.province)}:${normalizeGeographicSearch(city.name)}`,
            )
          ? city.name
          : HISTORICAL_LOCATION_GROUP,
      isHistorical: !city.canton,
    }));
  }, [cantons, cities]);

  // Cargar perfil del pasajero y lista de ciudades
  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const [profileData, citiesData] = await Promise.all([
          getPassengerProfile(),
          getTripCities().catch((err) => {
            if (active) {
              setCitiesError(
                err instanceof Error ? err.message : 'Error al cargar las localidades.',
              );
            }
            return [];
          }),
        ]);

        if (active) {
          setProfile(profileData);
          setCities(citiesData);
        }
      } catch (err) {
        if (active) {
          setProfileError(err instanceof Error ? err.message : 'Error al cargar información.');
        }
      } finally {
        if (active) {
          setIsLoadingProfile(false);
          setIsLoadingCities(false);
        }
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, []);

  // Cargar viajes de los siguientes 7 días (incluyendo salidas del día para bloquear las pasadas)
  useEffect(() => {
    let active = true;

    async function loadTrips() {
      setIsLoadingTrips(true);
      setTripsError(null);

      const startDate = nextSevenDays[0]?.dateString;
      const endDate = nextSevenDays[nextSevenDays.length - 1]?.dateString;

      try {
        const results = await searchPassengerTrips({
          travelDate: startDate,
          endDate,
          includePast: true,
          originCityId: originCityId ? Number(originCityId) : undefined,
          destinationCityId: destinationCityId ? Number(destinationCityId) : undefined,
        });

        if (active) {
          setTrips(results);
        }
      } catch (err) {
        if (active) {
          setTrips([]);
          setTripsError(
            err instanceof Error ? err.message : 'Error al consultar las rutas disponibles.',
          );
        }
      } finally {
        if (active) {
          setIsLoadingTrips(false);
        }
      }
    }

    void loadTrips();
    return () => {
      active = false;
    };
  }, [nextSevenDays, originCityId, destinationCityId]);

  // Filtrar viajes por la pestaña de día elegida (o todos)
  const displayedTrips = useMemo(() => {
    if (!selectedDay) return trips;
    return trips.filter((trip) => {
      const departureDate = trip.departureAt.slice(0, 10);
      return departureDate === selectedDay;
    });
  }, [trips, selectedDay]);

  const fullName = profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : '';

  if (isLoadingProfile) {
    return <p role="status">Cargando panel del pasajero...</p>;
  }

  if (profileError) {
    return (
      <p role="alert" className="passenger-dashboard__error">
        {profileError}
      </p>
    );
  }

  return (
    <section className="passenger-dashboard" aria-label="Panel principal del pasajero">
      <header className="passenger-dashboard__header">
        <p className="passenger-dashboard__eyebrow">TRANSPORTE INTERPROVINCIAL</p>
        <h1>¡Bienvenido{fullName ? `, ${fullName}` : ''}!</h1>
        <p>
          Consulta los viajes programados de los <strong>próximos 7 días</strong> y adquiere tus
          boletos con selección de asiento en tiempo real.
        </p>
      </header>

      {/* Barra de accesos directos rápidos */}
      <div className="passenger-dashboard__quick-links">
        <Link to="/pasajero/reservas" className="passenger-dashboard__quick-link">
          <span>📋</span>
          <div>
            <strong>Mis Reservas</strong>
            <small>Revisar reservas y pagos pendientes</small>
          </div>
        </Link>
        <Link to="/pasajero/boletos" className="passenger-dashboard__quick-link">
          <span>🎟️</span>
          <div>
            <strong>Mis Boletos</strong>
            <small>Ver boletos emitidos y códigos QR</small>
          </div>
        </Link>
        <Link to="/pasajero/perfil" className="passenger-dashboard__quick-link">
          <span>👤</span>
          <div>
            <strong>Mi Perfil</strong>
            <small>Cédula, correo y categoría</small>
          </div>
        </Link>
      </div>

      {/* Sección principal de Rutas y Salidas */}
      <section className="passenger-dashboard__routes-section" aria-labelledby="routes-heading">
        <div className="passenger-dashboard__routes-header">
          <div>
            <h2 id="routes-heading">Rutas y salidas disponibles (Próximos 7 días)</h2>
            <p>
              Selecciona el día que deseas viajar. Las rutas cuya salida ya ocurrió se muestran
              bloqueadas automáticamente.
            </p>
          </div>

          <div className="passenger-dashboard__city-filters">
            <PassengerLocationFilter
              classPrefix="passenger-dashboard"
              label="Origen"
              provinces={provinces}
              cantons={cantons}
              locations={selectableCities}
              province={originProvince}
              canton={originCanton}
              search={originSearch}
              value={originCityId}
              excludedCityId={destinationCityId}
              disabled={isLoadingCities || isLoadingTrips}
              onProvinceChange={(value) => {
                setOriginProvince(value);
                setOriginCanton('');
                setOriginSearch('');
                setOriginCityId('');
              }}
              onCantonChange={(value) => {
                setOriginCanton(value);
                setOriginSearch('');
                setOriginCityId('');
              }}
              onSearchChange={(value) => {
                setOriginSearch(value);
                setOriginCityId('');
              }}
              onValueChange={(value) => {
                setOriginCityId(value);
                if (value && value === destinationCityId) setDestinationCityId('');
              }}
            />
            <PassengerLocationFilter
              classPrefix="passenger-dashboard"
              label="Destino"
              provinces={provinces}
              cantons={cantons}
              locations={selectableCities}
              province={destinationProvince}
              canton={destinationCanton}
              search={destinationSearch}
              value={destinationCityId}
              excludedCityId={originCityId}
              disabled={isLoadingCities || isLoadingTrips}
              onProvinceChange={(value) => {
                setDestinationProvince(value);
                setDestinationCanton('');
                setDestinationSearch('');
                setDestinationCityId('');
              }}
              onCantonChange={(value) => {
                setDestinationCanton(value);
                setDestinationSearch('');
                setDestinationCityId('');
              }}
              onSearchChange={(value) => {
                setDestinationSearch(value);
                setDestinationCityId('');
              }}
              onValueChange={(value) => {
                setDestinationCityId(value);
                if (value && value === originCityId) setOriginCityId('');
              }}
            />
            {citiesError && (
              <p role="alert" className="passenger-dashboard__error">
                No se pudieron cargar las localidades: {citiesError}
              </p>
            )}
          </div>
        </div>

        {/* Pestañas de los 7 días */}
        <div className="passenger-dashboard__day-tabs" role="tablist" aria-label="Selección de día">
          {nextSevenDays.map((day) => {
            const isSelected = selectedDay === day.dateString;
            const tripCount = trips.filter(
              (t) => t.departureAt.slice(0, 10) === day.dateString,
            ).length;

            return (
              <button
                key={day.dateString}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`passenger-dashboard__day-tab${
                  isSelected ? ' passenger-dashboard__day-tab--active' : ''
                }`}
                onClick={() => setSelectedDay(day.dateString)}
              >
                <span className="passenger-dashboard__day-name">{day.dayName}</span>
                <span className="passenger-dashboard__day-date">{day.formattedDate}</span>
                {!isLoadingTrips && (
                  <span className="passenger-dashboard__day-badge">{tripCount}</span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            role="tab"
            aria-selected={selectedDay === ''}
            className={`passenger-dashboard__day-tab${
              selectedDay === '' ? ' passenger-dashboard__day-tab--active' : ''
            }`}
            onClick={() => setSelectedDay('')}
          >
            <span className="passenger-dashboard__day-name">Todos</span>
            <span className="passenger-dashboard__day-date">7 días</span>
            {!isLoadingTrips && (
              <span className="passenger-dashboard__day-badge">{trips.length}</span>
            )}
          </button>
        </div>

        {/* Mensaje de carga o error */}
        {isLoadingTrips && (
          <p role="status" className="passenger-dashboard__loading">
            Consultando rutas y horarios disponibles...
          </p>
        )}

        {tripsError && (
          <p role="alert" className="passenger-dashboard__error">
            {tripsError}
          </p>
        )}

        {/* Listado de rutas del día */}
        {!isLoadingTrips && !tripsError && (
          <div className="passenger-dashboard__trip-list">
            {displayedTrips.length === 0 ? (
              <div className="passenger-dashboard__empty">
                <h3>No hay rutas registradas para este día</h3>
                <p>Prueba seleccionando otro de los 7 días o quitando los filtros de ciudad.</p>
              </div>
            ) : (
              displayedTrips.map((trip) => {
                const past = isTripPast(trip);

                return (
                  <article
                    key={trip.tripId}
                    className={`passenger-trip-card${past ? ' passenger-trip-card--past' : ''}`}
                  >
                    <header className="passenger-trip-card__header">
                      <div className="passenger-trip-card__company">
                        <span className="passenger-trip-card__caption">COOPERATIVA</span>
                        <h3>{trip.cooperativeName}</h3>
                      </div>

                      <div className="passenger-trip-card__status-wrap">
                        {past ? (
                          <span className="passenger-trip-badge passenger-trip-badge--past">
                            ⛔ Salida pasada
                          </span>
                        ) : (
                          <span className="passenger-trip-badge passenger-trip-badge--active">
                            🟢 Salida disponible
                          </span>
                        )}
                        <span className="passenger-trip-card__id">Viaje #{trip.tripId}</span>
                      </div>
                    </header>

                    <div className="passenger-trip-card__route-line">
                      <span className="passenger-trip-card__city">{trip.originCityName}</span>
                      <span className="passenger-trip-card__arrow" aria-hidden="true">
                        ➔
                      </span>
                      <span className="passenger-trip-card__city">{trip.destinationCityName}</span>
                    </div>

                    <div className="passenger-trip-card__meta">
                      <div className="passenger-trip-card__meta-item">
                        <span>Horario de Salida</span>
                        <strong>{formatDeparture(trip.departureAt)}</strong>
                      </div>

                      <div className="passenger-trip-card__meta-item">
                        <span>Duración estimada</span>
                        <strong>{formatDuration(trip.durationMinutes)}</strong>
                      </div>

                      <div className="passenger-trip-card__meta-item">
                        <span>Unidad de transporte</span>
                        <strong>Bus #{trip.busNumber}</strong>
                      </div>

                      {trip.totalSeats !== undefined && (
                        <div className="passenger-trip-card__meta-item">
                          <span>Disponibilidad</span>
                          <strong
                            style={{
                              color:
                                (trip.availableSeats ?? 0) <= 5
                                  ? '#b91c1c'
                                  : (trip.availableSeats ?? 0) <= 15
                                    ? '#d97706'
                                    : '#15803d',
                            }}
                          >
                            {trip.availableSeats ?? 0} de {trip.totalSeats} asientos libres
                          </strong>
                        </div>
                      )}
                    </div>

                    <div className="passenger-trip-card__fares">
                      <span>Tarifas base:</span>
                      <div className="passenger-trip-card__fare-tags">
                        {trip.fares.length > 0 ? (
                          trip.fares.map((fare) => (
                            <span key={fare.seatType} className="passenger-trip-card__fare-tag">
                              {fare.seatType.toUpperCase()}:{' '}
                              <strong>{formatPrice(fare.price)}</strong>
                            </span>
                          ))
                        ) : (
                          <span className="passenger-trip-card__fare-tag">
                            Tarifas no configuradas
                          </span>
                        )}
                      </div>
                    </div>

                    {past ? (
                      <div className="passenger-trip-card__action-box">
                        <button
                          type="button"
                          disabled
                          className="passenger-trip-card__button passenger-trip-card__button--disabled"
                          title="Esta salida ya pasó y no permite compras ni reservas"
                        >
                          Salida cerrada
                        </button>
                        <p className="passenger-trip-card__past-hint">
                          Este viaje ya partió o su horario de salida ya concluyó.
                        </p>
                      </div>
                    ) : (
                      <div className="passenger-trip-card__action-box">
                        <Link
                          to={`/pasajero/viajes/${trip.tripId}/asientos?origen=${trip.originCityId}&destino=${trip.destinationCityId}`}
                          className="passenger-trip-card__button passenger-trip-card__button--primary"
                        >
                          Comprar / Reservar boleto
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}
      </section>
    </section>
  );
}
