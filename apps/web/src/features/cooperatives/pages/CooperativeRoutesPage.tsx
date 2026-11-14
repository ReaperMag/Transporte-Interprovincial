import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';
import {
  createCooperativeFrequency,
  createCooperativeRoute,
  getCooperativeFrequencies,
  getCooperativeRoutes,
  getRouteCities,
  getRouteSheet,
  publishRouteSheet,
  saveCooperativeRouteFares,
  saveRouteSheet,
  type CooperativeFrequency,
  type CooperativeRoute,
  type RouteCity,
  type RouteSheet,
} from '../services/routeSchedule.service';
import './CooperativeRoutesPage.css';
import { preventNonNumericKeys } from '../../../shared/utils/validation';
import {
  getGeographicCatalog,
  type GeographicCatalog,
  type GeographicPlace,
} from '../../geography/services/geographicCatalog.service';

function farePriceKey(
  routeId: number,
  originCityId: number,
  destinationCityId: number,
  seatType: 'normal' | 'vip',
): string {
  return `${routeId}:${originCityId}:${destinationCityId}:${seatType}`;
}

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

function normalizeLocationSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

interface GeographicLocationPickerProps {
  title: string;
  provinces: string[];
  cantons: GeographicPlace[];
  localities: GeographicPlace[];
  province: string;
  canton: string;
  search: string;
  value: string;
  excludedIds?: string[];
  onProvinceChange: (value: string) => void;
  onCantonChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
}

function GeographicLocationPicker({
  title,
  provinces,
  cantons,
  localities,
  province,
  canton,
  search,
  value,
  excludedIds = [],
  onProvinceChange,
  onCantonChange,
  onSearchChange,
  onValueChange,
}: GeographicLocationPickerProps) {
  const filteredCantons = cantons.filter((item) => item.province === province);
  const query = normalizeLocationSearch(search);
  const filteredLocalities = localities.filter(
    (item) =>
      item.province === province &&
      item.canton === canton &&
      !excludedIds.includes(String(item.id)) &&
      (!query || normalizeLocationSearch(item.name).includes(query)),
  );

  return (
    <fieldset className="cooperative-routes__location-picker">
      <legend>{title}</legend>
      <div className="cooperative-routes__location-fields">
        <label>
          Provincia
          <select
            value={province}
            onChange={(event) => onProvinceChange(event.target.value)}
            required
          >
            <option value="">Selecciona provincia</option>
            {provinces.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cantón
          <select
            value={canton}
            onChange={(event) => onCantonChange(event.target.value)}
            disabled={!province}
            required
          >
            <option value="">Selecciona cantón</option>
            {filteredCantons.map((item) => (
              <option value={item.name} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar localidad
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            disabled={!canton}
            placeholder="Escribe el nombre"
          />
        </label>
        <label>
          Localidad
          <select
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            disabled={!canton}
            required
          >
            <option value="">Selecciona localidad</option>
            {filteredLocalities.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}

interface RouteStopDraft {
  cityId: string;
  minutes: string;
  province: string;
  canton: string;
  search: string;
}

export function CooperativeRoutesPage() {
  const [cities, setCities] = useState<RouteCity[]>([]);
  const [geographicCatalog, setGeographicCatalog] = useState<GeographicCatalog | null>(null);
  const [routes, setRoutes] = useState<CooperativeRoute[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [frequencies, setFrequencies] = useState<CooperativeFrequency[]>([]);
  const [plans, setPlans] = useState<Record<string, RouteSheet>>({});
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [serviceDate, setServiceDate] = useState(localDateValue);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedCityId, setSelectedCityId] = useState('');
  const [selectedDestinationCityId, setSelectedDestinationCityId] = useState('');
  const [originProvince, setOriginProvince] = useState('');
  const [originCanton, setOriginCanton] = useState('');
  const [originSearch, setOriginSearch] = useState('');
  const [destinationProvince, setDestinationProvince] = useState('');
  const [destinationCanton, setDestinationCanton] = useState('');
  const [destinationSearch, setDestinationSearch] = useState('');
  const [routeDuration, setRouteDuration] = useState('240');
  const [stops, setStops] = useState<RouteStopDraft[]>([]);
  const [frequencyTime, setFrequencyTime] = useState('08:00');
  const [resolutionNumber, setResolutionNumber] = useState('');
  const [farePrices, setFarePrices] = useState<Record<string, string>>({});
  const [isSavingFares, setIsSavingFares] = useState(false);
  const [assignedBuses, setAssignedBuses] = useState<Record<string, Record<number, string>>>({});
  const [startingCities, setStartingCities] = useState<Record<string, Record<number, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadedPlanKey, setLoadedPlanKey] = useState('');
  const [savingDate, setSavingDate] = useState<string | null>(null);
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
        const [cityResult, catalogResult, routeResult, groupResult] = await Promise.all([
          getRouteCities(),
          getGeographicCatalog(),
          getCooperativeRoutes(),
          getCooperativeBusGroups(),
        ]);
        if (!active) return;
        const defaultOrigin =
          catalogResult.localities.find(
            (city) => normalizeLocationSearch(city.name) === 'ambato',
          ) ?? catalogResult.localities[0];
        const defaultDestination =
          catalogResult.localities.find((city) => normalizeLocationSearch(city.name) === 'quito') ??
          catalogResult.localities.find((city) => city.id !== defaultOrigin?.id);
        setCities(cityResult);
        setGeographicCatalog(catalogResult);
        setRoutes(routeResult);
        setGroups(groupResult);
        setSelectedGroupId((current) => current || String(groupResult[0]?.id ?? ''));
        setSelectedCityId((current) => current || String(defaultOrigin?.id ?? ''));
        setSelectedDestinationCityId((current) => current || String(defaultDestination?.id ?? ''));
        setOriginProvince(defaultOrigin?.province ?? '');
        setOriginCanton(defaultOrigin?.canton ?? '');
        setDestinationProvince(defaultDestination?.province ?? '');
        setDestinationCanton(defaultDestination?.canton ?? '');
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

  const selectedRoute = useMemo(
    () =>
      routes.find(
        (route) =>
          String(route.id) === selectedRouteId && route.isActive && route.durationMinutes !== null,
      ) ?? null,
    [routes, selectedRouteId],
  );

  const fareSegments = useMemo(() => {
    if (!selectedRoute) return [];

    const cityIds = [
      selectedRoute.originCityId,
      ...selectedRoute.stops.map((stop) => stop.cityId),
      selectedRoute.destinationCityId,
    ];
    const cityName = (cityId: number) =>
      cities.find((city) => city.id === cityId)?.name ?? `Ciudad ${cityId}`;
    const segments: Array<{ originCityId: number; destinationCityId: number; label: string }> = [];

    for (let origin = 0; origin < cityIds.length; origin += 1) {
      for (let destination = origin + 1; destination < cityIds.length; destination += 1) {
        segments.push({
          originCityId: cityIds[origin],
          destinationCityId: cityIds[destination],
          label: `${cityName(cityIds[origin])} → ${cityName(cityIds[destination])}`,
        });
      }
    }

    return segments;
  }, [selectedRoute, cities]);

  const fareValue = (
    segment: { originCityId: number; destinationCityId: number },
    seatType: 'normal' | 'vip',
  ): string => {
    if (!selectedRoute) return '';

    const key = farePriceKey(
      selectedRoute.id,
      segment.originCityId,
      segment.destinationCityId,
      seatType,
    );
    const edited = farePrices[key];
    if (edited !== undefined) return edited;

    const saved = selectedRoute.fares.find(
      (fare) =>
        fare.originCityId === segment.originCityId &&
        fare.destinationCityId === segment.destinationCityId &&
        fare.seatType === seatType,
    );
    return saved === undefined ? '' : String(saved.price);
  };

  const activeRoutes = routes.filter((route) => route.isActive && route.durationMinutes !== null);
  const originCity = cities.find((city) => String(city.id) === selectedCityId);
  const destinationCity = cities.find((city) => String(city.id) === selectedDestinationCityId);
  const sheetFrequencies =
    plans[serviceDates[0]]?.frequencies ??
    frequencies.map((frequency) => ({
      frequencyId: frequency.id,
      routeId: frequency.routeId,
      routeName: frequency.routeName,
      departureTime: frequency.departureTime,
      durationMinutes: frequency.durationMinutes,
      resolutionNumber: frequency.resolutionNumber,
      stops: frequency.stops,
      busId: null,
    }));
  const isLoadingPlan = Boolean(selectedGroupId && serviceDate && loadedPlanKey !== planKey);

  const selectExampleRoute = (destinationName: string) => {
    const ambato = geographicCatalog?.localities.find(
      (city) => normalizeLocationSearch(city.name) === 'ambato',
    );
    const destination = geographicCatalog?.localities.find(
      (city) => normalizeLocationSearch(city.name) === normalizeLocationSearch(destinationName),
    );
    if (ambato && destination) {
      setSelectedCityId(String(ambato.id));
      setSelectedDestinationCityId(String(destination.id));
      setOriginProvince(ambato.province);
      setOriginCanton(ambato.canton ?? '');
      setOriginSearch('');
      setDestinationProvince(destination.province);
      setDestinationCanton(destination.canton ?? '');
      setDestinationSearch('');
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

  const handleSaveFares = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRoute) return;

    const fares: Array<{
      originCityId: number;
      destinationCityId: number;
      seatType: 'normal' | 'vip';
      price: number;
    }> = [];

    for (const segment of fareSegments) {
      for (const seatType of ['normal', 'vip'] as const) {
        const rawValue = fareValue(segment, seatType).trim();
        const price = Number(rawValue);

        if (!rawValue || !Number.isFinite(price) || price <= 0) {
          setError(
            `Completa la tarifa ${seatType === 'vip' ? 'VIP' : 'normal'} del tramo ${segment.label}.`,
          );
          return;
        }

        fares.push({
          originCityId: segment.originCityId,
          destinationCityId: segment.destinationCityId,
          seatType,
          price: Math.round(price * 100) / 100,
        });
      }
    }

    setError(null);
    setSuccess(null);
    setIsSavingFares(true);
    try {
      const updated = await saveCooperativeRouteFares(selectedRoute.id, fares);
      setRoutes((current) => current.map((route) => (route.id === updated.id ? updated : route)));
      setFarePrices((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => !key.startsWith(`${selectedRoute.id}:`)),
        ),
      );
      setSuccess(`Tarifas de ${updated.originCity} – ${updated.destinationCity} guardadas.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No fue posible guardar las tarifas de la ruta.',
      );
    } finally {
      setIsSavingFares(false);
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
        <p role="status">Cargando rutas, catálogo geográfico y grupos...</p>
      ) : (
        <>
          <section className="cooperative-routes__step" aria-labelledby="catalog-title">
            <div className="cooperative-routes__step-heading">
              <span>1</span>
              <div>
                <h3 id="catalog-title">Catálogo geográfico</h3>
                <p>
                  Las provincias, cantones y localidades son administrados por el administrador para
                  mantener las rutas estandarizadas.
                </p>
              </div>
            </div>
            <div className="cooperative-routes__city-actions">
              <span>{geographicCatalog?.provinces.length ?? 0} provincias</span>
              <span>{geographicCatalog?.cantons.length ?? 0} cantones</span>
              <span>{geographicCatalog?.localities.length ?? 0} localidades disponibles</span>
            </div>
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
                    !geographicCatalog?.localities.some(
                      (city) => normalizeLocationSearch(city.name) === 'ambato',
                    ) ||
                    !geographicCatalog?.localities.some(
                      (city) =>
                        normalizeLocationSearch(city.name) === normalizeLocationSearch(destination),
                    )
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
              <div className="cooperative-routes__location-grid">
                <GeographicLocationPicker
                  title="Origen"
                  provinces={geographicCatalog?.provinces ?? []}
                  cantons={geographicCatalog?.cantons ?? []}
                  localities={geographicCatalog?.localities ?? []}
                  province={originProvince}
                  canton={originCanton}
                  search={originSearch}
                  value={selectedCityId}
                  excludedIds={[selectedDestinationCityId, ...stops.map((stop) => stop.cityId)]}
                  onProvinceChange={(value) => {
                    setOriginProvince(value);
                    setOriginCanton('');
                    setOriginSearch('');
                    setSelectedCityId('');
                  }}
                  onCantonChange={(value) => {
                    setOriginCanton(value);
                    setOriginSearch('');
                    setSelectedCityId('');
                  }}
                  onSearchChange={(value) => {
                    setOriginSearch(value);
                    setSelectedCityId('');
                  }}
                  onValueChange={(value) => {
                    setSelectedCityId(value);
                    if (value && value === selectedDestinationCityId) {
                      setSelectedDestinationCityId('');
                    }
                  }}
                />
                <GeographicLocationPicker
                  title="Destino"
                  provinces={geographicCatalog?.provinces ?? []}
                  cantons={geographicCatalog?.cantons ?? []}
                  localities={geographicCatalog?.localities ?? []}
                  province={destinationProvince}
                  canton={destinationCanton}
                  search={destinationSearch}
                  value={selectedDestinationCityId}
                  excludedIds={[selectedCityId, ...stops.map((stop) => stop.cityId)]}
                  onProvinceChange={(value) => {
                    setDestinationProvince(value);
                    setDestinationCanton('');
                    setDestinationSearch('');
                    setSelectedDestinationCityId('');
                  }}
                  onCantonChange={(value) => {
                    setDestinationCanton(value);
                    setDestinationSearch('');
                    setSelectedDestinationCityId('');
                  }}
                  onSearchChange={(value) => {
                    setDestinationSearch(value);
                    setSelectedDestinationCityId('');
                  }}
                  onValueChange={(value) => {
                    setSelectedDestinationCityId(value);
                    if (value && value === selectedCityId) setSelectedCityId('');
                  }}
                />
              </div>
              <label>
                Duración del recorrido (minutos)
                <input
                  type="number"
                  onKeyDown={preventNonNumericKeys}
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
                      <GeographicLocationPicker
                        title={`Ubicación de la parada ${index + 1}`}
                        provinces={geographicCatalog?.provinces ?? []}
                        cantons={geographicCatalog?.cantons ?? []}
                        localities={geographicCatalog?.localities ?? []}
                        province={stop.province}
                        canton={stop.canton}
                        search={stop.search}
                        value={stop.cityId}
                        excludedIds={[
                          selectedCityId,
                          selectedDestinationCityId,
                          ...stops
                            .filter((_, stopIndex) => stopIndex !== index)
                            .map((otherStop) => otherStop.cityId),
                        ]}
                        onProvinceChange={(value) =>
                          setStops((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    province: value,
                                    canton: '',
                                    cityId: '',
                                    search: '',
                                  }
                                : item,
                            ),
                          )
                        }
                        onCantonChange={(value) =>
                          setStops((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, canton: value, cityId: '', search: '' }
                                : item,
                            ),
                          )
                        }
                        onSearchChange={(value) =>
                          setStops((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, search: value, cityId: '' } : item,
                            ),
                          )
                        }
                        onValueChange={(value) =>
                          setStops((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, cityId: value } : item,
                            ),
                          )
                        }
                      />
                      <label>
                        Minutos desde el origen
                        <input
                          type="number"
                          onKeyDown={preventNonNumericKeys}
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
                  onClick={() =>
                    setStops((current) => [
                      ...current,
                      { cityId: '', minutes: '', province: '', canton: '', search: '' },
                    ])
                  }
                  disabled={
                    !selectedCityId ||
                    !selectedDestinationCityId ||
                    (geographicCatalog?.localities.length ?? 0) < 3 ||
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
                  {routes.map((route) => {
                    const hasFares = route.fares.length > 0;
                    const isSelected = selectedRouteId === String(route.id);
                    return (
                      <li key={route.id}>
                        <div className="cooperative-routes__registered-header">
                          <div>
                            <strong>
                              {route.originCity} → {route.destinationCity}
                            </strong>
                            <small style={{ marginLeft: '0.5rem' }}>
                              {route.durationMinutes === null
                                ? 'Duración no configurada'
                                : `${Math.floor(route.durationMinutes / 60)} h ${route.durationMinutes % 60} min`}
                            </small>
                          </div>
                          <div className="cooperative-routes__registered-actions">
                            <span
                              className={`cooperative-routes__badge ${
                                hasFares
                                  ? 'cooperative-routes__badge--success'
                                  : 'cooperative-routes__badge--warning'
                              }`}
                            >
                              {hasFares ? `${route.fares.length} tarifas` : 'Sin tarifas'}
                            </span>
                            <button
                              type="button"
                              className={`cooperative-routes__button cooperative-routes__button--small ${
                                isSelected ? '' : 'cooperative-routes__button--secondary'
                              }`}
                              onClick={() => {
                                setSelectedRouteId(String(route.id));
                                const fareForm = document.querySelector(
                                  '.cooperative-routes__fares',
                                );
                                if (fareForm) {
                                  fareForm.scrollIntoView({ behavior: 'smooth' });
                                }
                              }}
                            >
                              {isSelected ? 'Tarifando...' : 'Tarifar ruta'}
                            </button>
                          </div>
                        </div>
                        <p>
                          {[
                            route.originCity,
                            ...route.stops.map((stop) => stop.cityName),
                            route.destinationCity,
                          ].join(' → ')}
                        </p>
                      </li>
                    );
                  })}
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
            {selectedRoute && (
              <form
                className="cooperative-routes__fares"
                onSubmit={(event) => void handleSaveFares(event)}
              >
                <div className="cooperative-routes__fares-heading">
                  <h4>Tarifas de la ruta</h4>
                  <p>
                    Precio por tramo y tipo de asiento de {selectedRoute.originCity} –{' '}
                    {selectedRoute.destinationCity}. Se usan al reservar asientos.
                  </p>
                </div>
                <div className="cooperative-routes__fare-grid">
                  <div className="cooperative-routes__fare-row cooperative-routes__fare-row--head">
                    <span>Tramo</span>
                    <span>Normal</span>
                    <span>VIP</span>
                  </div>
                  {fareSegments.map((segment) => (
                    <div
                      className="cooperative-routes__fare-row"
                      key={`${segment.originCityId}-${segment.destinationCityId}`}
                    >
                      <span>{segment.label}</span>
                      {(['normal', 'vip'] as const).map((seatType) => (
                        <input
                          key={seatType}
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step={0.01}
                          placeholder="0.00"
                          aria-label={`Tarifa ${seatType === 'vip' ? 'VIP' : 'normal'} del tramo ${segment.label}`}
                          value={fareValue(segment, seatType)}
                          onChange={(event) =>
                            setFarePrices((current) => ({
                              ...current,
                              [farePriceKey(
                                selectedRoute.id,
                                segment.originCityId,
                                segment.destinationCityId,
                                seatType,
                              )]: event.target.value,
                            }))
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="cooperative-routes__form-actions">
                  <button type="submit" disabled={isSavingFares}>
                    {isSavingFares ? 'Guardando...' : 'Guardar tarifas'}
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
                                    <option value="">Selecciona localidad inicial</option>
                                    {geographicCatalog?.localities.map((city) => (
                                      <option value={city.id} key={city.id}>
                                        {city.name} — {city.canton}, {city.province}
                                      </option>
                                    ))}
                                    {cities
                                      .filter(
                                        (city) =>
                                          String(city.id) === dayStartingCities[busId] &&
                                          !geographicCatalog?.localities.some(
                                            (locality) => locality.id === city.id,
                                          ),
                                      )
                                      .map((city) => (
                                        <option value={city.id} key={city.id}>
                                          {city.name} — ubicación histórica
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
