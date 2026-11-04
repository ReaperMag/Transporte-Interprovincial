import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';
import {
  createCooperativeFrequency,
  createCooperativeRoute,
  createRouteCity,
  getCooperativeFrequencies,
  getCooperativeRoutes,
  getRouteCities,
  getRouteSheet,
  publishRouteSheet,
  saveRouteSheet,
  type CooperativeFrequency,
  type CooperativeRoute,
  type RouteCity,
  type RouteSheet,
} from '../services/routeSchedule.service';
import './CooperativeRoutesPage.css';

const exampleCities = [
  { name: 'Ambato', province: 'Tungurahua' },
  { name: 'Quito', province: 'Pichincha' },
  { name: 'Guayaquil', province: 'Guayas' },
  { name: 'Riobamba', province: 'Chimborazo' },
  { name: 'Latacunga', province: 'Cotopaxi' },
];

function localDateValue(): string {
  const now = new Date();
  const localOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - localOffset).toISOString().slice(0, 10);
}

function displayTime(value: string): string {
  return value.slice(0, 5);
}

function dateOffset(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year, month - 1, day + days, 12);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
}

function dayLabel(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-EC', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
}

export function CooperativeRoutesPage() {
  const [cities, setCities] = useState<RouteCity[]>([]);
  const [routes, setRoutes] = useState<CooperativeRoute[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [frequencies, setFrequencies] = useState<CooperativeFrequency[]>([]);
  const [plans, setPlans] = useState<Record<string, RouteSheet>>({});
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [serviceDate, setServiceDate] = useState(localDateValue);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedDestinationCityId, setSelectedDestinationCityId] = useState('');
  const [routeDuration, setRouteDuration] = useState('240');
  const [stops, setStops] = useState<Array<{ cityId: string; minutes: string }>>([]);
  const [cityName, setCityName] = useState('');
  const [cityProvince, setCityProvince] = useState('');
  const [frequencyTime, setFrequencyTime] = useState('08:00');
  const [resolutionNumber, setResolutionNumber] = useState('');
  const [assignedBuses, setAssignedBuses] = useState<Record<string, Record<number, string>>>({});
  const [startingCities, setStartingCities] = useState<Record<string, Record<number, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadedPlanKey, setLoadedPlanKey] = useState('');
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [isCreatingCity, setIsCreatingCity] = useState(false);
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);
  const [isCreatingFrequency, setIsCreatingFrequency] = useState(false);
  const [publishingDate, setPublishingDate] = useState<string | null>(null);
  const [refreshPlan, setRefreshPlan] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const planKey = `${selectedGroupId}:${serviceDate}:${refreshPlan}`;
  const serviceDates = useMemo(
    () => Array.from({ length: 6 }, (_, index) => dateOffset(serviceDate, index)),
    [serviceDate],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [cityResult, routeResult, groupResult] = await Promise.all([
          getRouteCities(),
          getCooperativeRoutes(),
          getCooperativeBusGroups(),
        ]);
        if (!active) return;
        setCities(cityResult);
        setRoutes(routeResult);
        setGroups(groupResult);
        setSelectedGroupId((current) => current || String(groupResult[0]?.id ?? ''));
        setSelectedCityId((current) => current || String(cityResult[0]?.id ?? ''));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar la planificación de rutas.',
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!selectedGroupId) {
      return () => {
        active = false;
      };
    }
    void getCooperativeFrequencies(Number(selectedGroupId))
      .then((result) => {
        if (active) setFrequencies(result);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar las frecuencias.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [selectedGroupId, refreshPlan]);

  useEffect(() => {
    let active = true;
    if (!selectedGroupId || !serviceDate) {
      return () => {
        active = false;
      };
    }
    void Promise.all(
      serviceDates.map(
        async (day) => [day, await getRouteSheet(Number(selectedGroupId), day)] as const,
      ),
    )
      .then((results) => {
        if (!active) return;
        const nextPlans = Object.fromEntries(results);
        setPlans(nextPlans);
        setAssignedBuses(
          Object.fromEntries(
            results.map(([day, result]) => [
              day,
              Object.fromEntries(
                result.frequencies.map((frequency) => [
                  frequency.frequencyId,
                  frequency.busId === null ? '' : String(frequency.busId),
                ]),
              ),
            ]),
          ),
        );
        setStartingCities(
          Object.fromEntries(
            results.map(([day, result]) => [
              day,
              Object.fromEntries(
                result.startingLocations.map((location) => [
                  location.busId,
                  String(location.cityId),
                ]),
              ),
            ]),
          ),
        );
        setLoadedPlanKey(planKey);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar la hoja de ruta.',
          );
          setLoadedPlanKey(planKey);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedGroupId, serviceDate, refreshPlan, planKey, serviceDates]);

  const activeRoutes = routes.filter((route) => route.isActive && route.durationMinutes !== null);
  const originCity = cities.find((city) => String(city.id) === selectedCityId);
  const destinationCity = cities.find((city) => String(city.id) === selectedDestinationCityId);
  const sheetFrequencies = plans[serviceDates[0]]?.frequencies ?? [];
  const isLoadingPlan = Boolean(selectedGroupId && serviceDate && loadedPlanKey !== planKey);

  const refreshCities = async () => {
    const updated = await getRouteCities();
    setCities(updated);
    if (!selectedCityId && updated[0]) setSelectedCityId(String(updated[0].id));
    return updated;
  };

  const handleCreateExampleCities = async () => {
    setIsCreatingCity(true);
    setError(null);
    setSuccess(null);
    try {
      await Promise.all(exampleCities.map((city) => createRouteCity(city)));
      const updated = await refreshCities();
      const ambato = updated.find((city) => city.name.toLowerCase() === 'ambato');
      setSelectedCityId(String(ambato?.id ?? updated[0]?.id ?? ''));
      setSuccess('Ciudades de ejemplo listas: Ambato, Quito, Guayaquil, Riobamba y Latacunga.');
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'No fue posible preparar las ciudades.',
      );
    } finally {
      setIsCreatingCity(false);
    }
  };

  const handleCreateCity = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingCity(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createRouteCity({ name: cityName, province: cityProvince });
      await refreshCities();
      setSelectedCityId(String(created.id));
      setCityName('');
      setCityProvince('');
      setSuccess(`${created.name} quedó disponible para las rutas.`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No fue posible agregar la ciudad.',
      );
    } finally {
      setIsCreatingCity(false);
    }
  };

  const selectExampleRoute = (destinationName: string) => {
    const ambato = cities.find((city) => city.name.toLowerCase() === 'ambato');
    const destination = cities.find(
      (city) => city.name.toLowerCase() === destinationName.toLowerCase(),
    );
    if (ambato && destination) {
      setSelectedCityId(String(ambato.id));
      setSelectedDestinationCityId(String(destination.id));
    }
  };

  const handleCreateRoute = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingRoute(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createCooperativeRoute({
        originCityId: Number(selectedCityId),
        destinationCityId: Number(selectedDestinationCityId),
        durationMinutes: Number(routeDuration),
        stops: stops.map((stop) => ({
          cityId: Number(stop.cityId),
          minutesFromOrigin: Number(stop.minutes),
        })),
      });
      const updated = await getCooperativeRoutes();
      setRoutes(updated);
      setSelectedRouteId(String(created.id));
      setSelectedDestinationCityId('');
      setRouteDuration('240');
      setStops([]);
      setSuccess(`Ruta ${created.originCity} - ${created.destinationCity} creada.`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No fue posible crear la ruta.',
      );
    } finally {
      setIsCreatingRoute(false);
    }
  };

  const handleCreateFrequency = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreatingFrequency(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createCooperativeFrequency({
        routeId: Number(selectedRouteId),
        busGroupId: Number(selectedGroupId),
        departureTime: frequencyTime,
        resolutionNumber,
      });
      setFrequencies((current) =>
        [...current, created].sort((first, second) =>
          first.departureTime.localeCompare(second.departureTime),
        ),
      );
      setResolutionNumber('');
      setRefreshPlan((current) => current + 1);
      setSuccess(`Frecuencia ${displayTime(created.departureTime)} agregada al grupo.`);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No fue posible crear la frecuencia.',
      );
    } finally {
      setIsCreatingFrequency(false);
    }
  };

  const handleSavePlan = async (day: string) => {
    const plan = plans[day];
    if (!plan) return;
    const dayAssignments = assignedBuses[day] ?? {};
    const dayStartingCities = startingCities[day] ?? {};
    const dayBusIds = [...new Set(Object.values(dayAssignments).filter(Boolean).map(Number))].sort(
      (first, second) => first - second,
    );
    setSavingDate(day);
    setError(null);
    setSuccess(null);
    try {
      const saved = await saveRouteSheet({
        busGroupId: Number(selectedGroupId),
        serviceDate: day,
        assignments: plan.frequencies.map((frequency) => ({
          frequencyId: frequency.frequencyId,
          busId: dayAssignments[frequency.frequencyId]
            ? Number(dayAssignments[frequency.frequencyId])
            : null,
        })),
        startingLocations: dayBusIds.map((busId) => ({
          busId,
          cityId: Number(dayStartingCities[busId]),
        })),
      });
      setPlans((current) => ({ ...current, [day]: saved }));
      setSuccess(
        plan.status === 'published'
          ? `Reemplazo de bus guardado para el ${dayLabel(day)}.`
          : `Borrador del ${dayLabel(day)} guardado.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'No fue posible guardar la hoja de ruta.',
      );
    } finally {
      setSavingDate(null);
    }
  };

  const handlePublish = async (day: string) => {
    const plan = plans[day];
    if (!plan?.id) return;
    setPublishingDate(day);
    setError(null);
    setSuccess(null);
    try {
      const published = await publishRouteSheet(plan.id);
      setPlans((current) => ({ ...current, [day]: published }));
      setSuccess(
        `Hoja del ${dayLabel(day)} publicada. Los viajes quedan disponibles según las reglas actuales.`,
      );
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'No fue posible publicar la hoja de ruta.',
      );
    } finally {
      setPublishingDate(null);
    }
  };

  return (
    <section className="cooperative-routes" aria-labelledby="cooperative-routes-title">
      <header className="cooperative-routes__header">
        <p className="cooperative-routes__eyebrow">Planificación operativa</p>
        <h2 id="cooperative-routes-title">Rutas y frecuencias</h2>
        <p>
          Define el recorrido con sus paradas, asigna frecuencias a un grupo y organiza qué bus
          cubre cada servicio en la hoja diaria.
        </p>
      </header>

      {error && (
        <p className="cooperative-routes__message cooperative-routes__message--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p
          className="cooperative-routes__message cooperative-routes__message--success"
          role="status"
        >
          {success}
        </p>
      )}
      {isLoading ? (
        <p role="status">Cargando rutas, ciudades y grupos...</p>
      ) : (
        <>
          <section className="cooperative-routes__step" aria-labelledby="cities-title">
            <div className="cooperative-routes__step-heading">
              <span>1</span>
              <div>
                <h3 id="cities-title">Ciudades para los recorridos</h3>
                <p>Las ciudades se comparten para que puedan reutilizarse en otras rutas.</p>
              </div>
            </div>
            <div className="cooperative-routes__city-actions">
              <button
                className="cooperative-routes__button cooperative-routes__button--secondary"
                type="button"
                onClick={() => void handleCreateExampleCities()}
                disabled={isCreatingCity}
              >
                {isCreatingCity ? 'Preparando...' : 'Cargar ciudades de ejemplo'}
              </button>
              <span>{cities.length} ciudades disponibles</span>
            </div>
            <form
              className="cooperative-routes__city-form"
              onSubmit={(event) => void handleCreateCity(event)}
            >
              <label>
                Nueva ciudad
                <input
                  value={cityName}
                  onChange={(event) => setCityName(event.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Provincia
                <input
                  value={cityProvince}
                  onChange={(event) => setCityProvince(event.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <button type="submit" disabled={isCreatingCity}>
                Agregar ciudad
              </button>
            </form>
          </section>

          <section className="cooperative-routes__step" aria-labelledby="routes-builder-title">
            <div className="cooperative-routes__step-heading">
              <span>2</span>
              <div>
                <h3 id="routes-builder-title">Recorrido principal y subrutas</h3>
                <p>Ordena cada parada e indica en qué minuto se llega desde la ciudad de salida.</p>
              </div>
            </div>
            <div className="cooperative-routes__examples" aria-label="Ejemplos de rutas">
              <span>Ejemplos:</span>
              {['Quito', 'Guayaquil', 'Riobamba'].map((destination) => (
                <button
                  type="button"
                  key={destination}
                  onClick={() => selectExampleRoute(destination)}
                  disabled={
                    !cities.some((city) => city.name.toLowerCase() === 'ambato') ||
                    !cities.some((city) => city.name.toLowerCase() === destination.toLowerCase())
                  }
                >
                  Ambato – {destination}
                </button>
              ))}
            </div>
            <form
              className="cooperative-routes__form"
              onSubmit={(event) => void handleCreateRoute(event)}
            >
              <label>
                Ciudad de origen
                <select
                  value={selectedCityId}
                  onChange={(event) => setSelectedCityId(event.target.value)}
                  required
                >
                  <option value="">Selecciona origen</option>
                  {cities.map((city) => (
                    <option value={city.id} key={city.id}>
                      {city.name}, {city.province}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ciudad de destino
                <select
                  value={selectedDestinationCityId}
                  onChange={(event) => setSelectedDestinationCityId(event.target.value)}
                  required
                >
                  <option value="">Selecciona destino</option>
                  {cities
                    .filter((city) => String(city.id) !== selectedCityId)
                    .map((city) => (
                      <option value={city.id} key={city.id}>
                        {city.name}, {city.province}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Duración del recorrido (minutos)
                <input
                  type="number"
                  min={10}
                  max={1440}
                  required
                  value={routeDuration}
                  onChange={(event) => setRouteDuration(event.target.value)}
                />
              </label>

              {originCity && destinationCity && (
                <div
                  className="cooperative-routes__preview"
                  aria-label="Vista previa del recorrido"
                >
                  <div className="cooperative-routes__preview-stop">
                    <span />
                    <strong>{originCity.name}</strong>
                    <small>Salida</small>
                  </div>
                  {stops.map((stop, index) => {
                    const city = cities.find((item) => String(item.id) === stop.cityId);
                    return (
                      <div
                        className="cooperative-routes__preview-stop"
                        key={`${index}-${stop.cityId}`}
                      >
                        <span />
                        <strong>{city?.name || 'Elige ciudad'}</strong>
                        <small>
                          {stop.minutes ? `${stop.minutes} min` : 'Tiempo desde salida'}
                        </small>
                      </div>
                    );
                  })}
                  <div className="cooperative-routes__preview-stop cooperative-routes__preview-stop--end">
                    <span />
                    <strong>{destinationCity.name}</strong>
                    <small>{routeDuration ? `${routeDuration} min · Llegada` : 'Llegada'}</small>
                  </div>
                </div>
              )}

              {stops.length > 0 && (
                <div className="cooperative-routes__stop-list">
                  <h4>Paradas en orden</h4>
                  {stops.map((stop, index) => (
                    <div className="cooperative-routes__stop-row" key={index}>
                      <span className="cooperative-routes__stop-number">{index + 1}</span>
                      <label>
                        Ciudad de parada
                        <select
                          value={stop.cityId}
                          onChange={(event) =>
                            setStops((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, cityId: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          required
                        >
                          <option value="">Selecciona ciudad</option>
                          {cities
                            .filter(
                              (city) =>
                                String(city.id) !== selectedCityId &&
                                String(city.id) !== selectedDestinationCityId,
                            )
                            .map((city) => (
                              <option value={city.id} key={city.id}>
                                {city.name}, {city.province}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Minutos desde el origen
                        <input
                          type="number"
                          min={1}
                          max={Number(routeDuration) - 1}
                          required
                          value={stop.minutes}
                          onChange={(event) =>
                            setStops((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, minutes: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        className="cooperative-routes__button cooperative-routes__button--danger"
                        type="button"
                        onClick={() =>
                          setStops((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="cooperative-routes__form-actions">
                <button
                  className="cooperative-routes__button cooperative-routes__button--secondary"
                  type="button"
                  onClick={() => setStops((current) => [...current, { cityId: '', minutes: '' }])}
                  disabled={
                    !selectedCityId ||
                    !selectedDestinationCityId ||
                    cities.length < 3 ||
                    stops.length >= 20
                  }
                >
                  Añadir subruta
                </button>
                <button
                  type="submit"
                  disabled={
                    isCreatingRoute ||
                    !cities.length ||
                    !selectedCityId ||
                    !selectedDestinationCityId
                  }
                >
                  {isCreatingRoute ? 'Guardando...' : 'Guardar ruta'}
                </button>
              </div>
            </form>
            <div className="cooperative-routes__registered">
              <h4>Rutas registradas</h4>
              {routes.length === 0 ? (
                <p className="cooperative-routes__empty">
                  Aún no se han definido rutas para esta cooperativa.
                </p>
              ) : (
                <ul>
                  {routes.map((route) => (
                    <li key={route.id}>
                      <div>
                        <strong>
                          {route.originCity} → {route.destinationCity}
                        </strong>
                        <small>
                          {route.durationMinutes === null
                            ? 'Duración no configurada'
                            : `${Math.floor(route.durationMinutes / 60)} h ${route.durationMinutes % 60} min`}
                        </small>
                      </div>
                      <p>
                        {[
                          route.originCity,
                          ...route.stops.map((stop) => stop.cityName),
                          route.destinationCity,
                        ].join(' → ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="cooperative-routes__step" aria-labelledby="frequency-title">
            <div className="cooperative-routes__step-heading">
              <span>3</span>
              <div>
                <h3 id="frequency-title">Frecuencias por grupo</h3>
                <p>
                  Cada grupo reúne los buses que pueden cubrir estas salidas y sustituirse entre sí.
                </p>
              </div>
            </div>
            {groups.length === 0 ? (
              <p className="cooperative-routes__empty">
                Primero crea un grupo en la pestaña Grupos de buses.
              </p>
            ) : activeRoutes.length === 0 ? (
              <p className="cooperative-routes__empty">
                Primero registra una ruta con su duración.
              </p>
            ) : (
              <form
                className="cooperative-routes__form cooperative-routes__frequency-form"
                onSubmit={(event) => void handleCreateFrequency(event)}
              >
                <label>
                  Grupo de buses
                  <select
                    value={selectedGroupId}
                    onChange={(event) => {
                      setSelectedGroupId(event.target.value);
                      setFrequencies([]);
                      setPlans({});
                      setAssignedBuses({});
                      setStartingCities({});
                    }}
                    required
                  >
                    {groups.map((group) => (
                      <option value={group.id} key={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ruta
                  <select
                    value={selectedRouteId}
                    onChange={(event) => setSelectedRouteId(event.target.value)}
                    required
                  >
                    <option value="">Selecciona una ruta</option>
                    {activeRoutes.map((route) => (
                      <option value={route.id} key={route.id}>
                        {route.originCity} – {route.destinationCity}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Hora de salida
                  <input
                    type="time"
                    value={frequencyTime}
                    onChange={(event) => setFrequencyTime(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Resolución ANT
                  <input
                    value={resolutionNumber}
                    onChange={(event) => setResolutionNumber(event.target.value)}
                    maxLength={50}
                    required
                  />
                </label>
                <div className="cooperative-routes__form-actions">
                  <button type="submit" disabled={isCreatingFrequency}>
                    {isCreatingFrequency ? 'Guardando...' : 'Agregar frecuencia'}
                  </button>
                </div>
              </form>
            )}
            <div className="cooperative-routes__frequency-list">
              <h4>Frecuencias del grupo seleccionado</h4>
              {frequencies.length === 0 ? (
                <p className="cooperative-routes__empty">
                  Todavía no hay frecuencias para este grupo.
                </p>
              ) : (
                <ul>
                  {frequencies.map((frequency) => (
                    <li key={frequency.id}>
                      <strong>{displayTime(frequency.departureTime)}</strong>
                      <span>{frequency.routeName}</span>
                      <small>{frequency.resolutionNumber}</small>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="cooperative-routes__step" aria-labelledby="route-sheet-title">
            <div className="cooperative-routes__step-heading">
              <span>4</span>
              <div>
                <h3 id="route-sheet-title">Hoja de ruta del grupo</h3>
                <p>
                  Organiza seis días como en la hoja por grupo. Cada fecha se guarda y publica por
                  separado.
                </p>
              </div>
            </div>
            <div className="cooperative-routes__sheet-controls">
              <label>
                Grupo
                <select
                  value={selectedGroupId}
                  onChange={(event) => {
                    setSelectedGroupId(event.target.value);
                    setFrequencies([]);
                    setPlans({});
                    setAssignedBuses({});
                    setStartingCities({});
                  }}
                  disabled={!groups.length}
                >
                  {groups.map((group) => (
                    <option value={group.id} key={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Inicio del periodo
                <input
                  type="date"
                  value={serviceDate}
                  onChange={(event) => {
                    setServiceDate(event.target.value);
                    setPlans({});
                    setAssignedBuses({});
                    setStartingCities({});
                  }}
                />
              </label>
            </div>
            {!groups.length ? (
              <p className="cooperative-routes__empty">
                Crea primero un grupo de buses para planificar sus servicios.
              </p>
            ) : isLoadingPlan ? (
              <p className="cooperative-routes__empty" role="status">
                Cargando las hojas del periodo...
              </p>
            ) : !serviceDates.every((day) => plans[day]) ? (
              <div className="cooperative-routes__empty">
                <p>
                  No fue posible consultar todas las hojas del periodo. Revisa el aviso anterior e
                  inténtalo de nuevo.
                </p>
                <button type="button" onClick={() => setRefreshPlan((current) => current + 1)}>
                  Reintentar
                </button>
              </div>
            ) : sheetFrequencies.length === 0 ? (
              <p className="cooperative-routes__empty">
                Agrega frecuencias al grupo para preparar su hoja de ruta.
              </p>
            ) : (
              <>
                {serviceDates.some((day) => plans[day]?.buses.length === 0) && (
                  <p className="cooperative-routes__empty cooperative-routes__empty--notice">
                    Este grupo no tiene buses registrados. Agrégalos desde la pestaña Buses para
                    poder asignar las frecuencias.
                  </p>
                )}
                <div className="cooperative-routes__table-wrap">
                  <table className="cooperative-routes__sheet-table cooperative-routes__week-table">
                    <thead>
                      <tr>
                        <th>Origen – destino</th>
                        <th>Salida</th>
                        <th>Subrutas</th>
                        {serviceDates.map((day) => (
                          <th key={day}>
                            <span>{dayLabel(day)}</span>
                            <small>
                              {plans[day]?.status === 'published'
                                ? 'Publicada'
                                : plans[day]?.status === 'draft'
                                  ? 'Borrador'
                                  : 'Sin guardar'}
                            </small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetFrequencies.map((frequency) => (
                        <tr key={frequency.frequencyId}>
                          <td>
                            <strong>{frequency.routeName}</strong>
                            <small>{frequency.resolutionNumber}</small>
                          </td>
                          <td>{displayTime(frequency.departureTime)}</td>
                          <td>
                            {frequency.stops.length
                              ? frequency.stops.join(' → ')
                              : 'Sin paradas intermedias'}
                          </td>
                          {serviceDates.map((day) => {
                            const dayPlan = plans[day];
                            const isPublished = dayPlan?.status === 'published';
                            const canEditBus = !isPublished || dayPlan.canReassign;
                            return (
                              <td key={day}>
                                <select
                                  aria-label={`${frequency.routeName} ${dayLabel(day)}`}
                                  value={assignedBuses[day]?.[frequency.frequencyId] ?? ''}
                                  onChange={(event) =>
                                    setAssignedBuses((current) => ({
                                      ...current,
                                      [day]: {
                                        ...current[day],
                                        [frequency.frequencyId]: event.target.value,
                                      },
                                    }))
                                  }
                                  disabled={!canEditBus}
                                >
                                  <option value="" disabled={isPublished}>
                                    Sin asignar
                                  </option>
                                  {dayPlan?.buses.map((bus) => (
                                    <option
                                      value={bus.id}
                                      key={bus.id}
                                      disabled={!bus.isActive || bus.status !== 'operativo'}
                                    >
                                      Bus {bus.number}
                                      {bus.status !== 'operativo'
                                        ? ` · ${bus.status.replaceAll('_', ' ')}`
                                        : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="cooperative-routes__hint">
                  Selecciona el bus de cada salida en cada día. Los buses en mantenimiento o fuera
                  de servicio se bloquean; se validan 30 minutos entre servicios y continuidad de
                  ciudad para las rutas del mismo día.
                </p>
                <div className="cooperative-routes__day-grid">
                  {serviceDates.map((day) => {
                    const dayPlan = plans[day];
                    const dayAssignments = assignedBuses[day] ?? {};
                    const dayStartingCities = startingCities[day] ?? {};
                    const dayBusIds = [
                      ...new Set(Object.values(dayAssignments).filter(Boolean).map(Number)),
                    ].sort((first, second) => first - second);
                    const everyFrequencyAssigned =
                      !!dayPlan?.frequencies.length &&
                      dayPlan.frequencies.every((frequency) =>
                        Boolean(dayAssignments[frequency.frequencyId]),
                      );
                    const everyBusHasStartingCity = dayBusIds.every((busId) =>
                      Boolean(dayStartingCities[busId]),
                    );
                    const isPublished = dayPlan?.status === 'published';
                    const canEditBus = !isPublished || Boolean(dayPlan?.canReassign);
                    return (
                      <section className="cooperative-routes__day-card" key={day}>
                        <header>
                          <h4>{dayLabel(day)}</h4>
                          <span
                            className={`cooperative-routes__status cooperative-routes__status--${dayPlan?.status ?? 'empty'}`}
                          >
                            {isPublished
                              ? 'Publicada'
                              : dayPlan?.status === 'draft'
                                ? 'Borrador'
                                : 'Sin guardar'}
                          </span>
                        </header>
                        {dayBusIds.length > 0 && (
                          <div className="cooperative-routes__locations">
                            <h5>Ubicación inicial de buses</h5>
                            {dayBusIds.map((busId) => {
                              const bus = dayPlan?.buses.find((item) => item.id === busId);
                              return (
                                <label key={busId}>
                                  Bus {bus?.number ?? busId}
                                  <select
                                    value={dayStartingCities[busId] ?? ''}
                                    onChange={(event) =>
                                      setStartingCities((current) => ({
                                        ...current,
                                        [day]: {
                                          ...current[day],
                                          [busId]: event.target.value,
                                        },
                                      }))
                                    }
                                    disabled={!canEditBus}
                                  >
                                    <option value="">Selecciona ciudad inicial</option>
                                    {cities.map((city) => (
                                      <option value={city.id} key={city.id}>
                                        {city.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div className="cooperative-routes__day-actions">
                          <button
                            type="button"
                            className="cooperative-routes__button cooperative-routes__button--secondary"
                            onClick={() => void handleSavePlan(day)}
                            disabled={
                              !dayPlan ||
                              !canEditBus ||
                              savingDate !== null ||
                              !everyBusHasStartingCity
                            }
                          >
                            {savingDate === day
                              ? 'Guardando...'
                              : isPublished
                                ? 'Guardar reemplazo'
                                : 'Guardar borrador'}
                          </button>
                          {dayPlan?.id && !isPublished && (
                            <button
                              type="button"
                              className="cooperative-routes__button cooperative-routes__button--publish"
                              onClick={() => void handlePublish(day)}
                              disabled={
                                publishingDate !== null ||
                                savingDate !== null ||
                                !everyFrequencyAssigned ||
                                !everyBusHasStartingCity
                              }
                            >
                              {publishingDate === day ? 'Publicando...' : 'Publicar'}
                            </button>
                          )}
                          {isPublished && (
                            <span className="cooperative-routes__published-note">
                              {dayPlan.canReassign
                                ? 'Sin reservas: puedes sustituir un bus.'
                                : 'Solo lectura: el servicio tiene reservas o ya inició.'}
                            </span>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </section>
  );
}
