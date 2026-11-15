import { useEffect, useMemo, useRef, useState } from 'react';
import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';
import {
  getCooperativeFrequencies,
  getCooperativeRoutes,
  getRouteCities,
  getRouteSheetAutoPlan,
  publishRouteSheet,
  saveRouteSheet,
  type CooperativeFrequency,
  type CooperativeRoute,
  type RouteCity,
  type RouteSheet,
  type RouteSheetWarning,
} from '../services/routeSchedule.service';
import {
  getCooperativeSeatTypes,
  type CooperativeSeatType,
} from '../services/seatType.service';
import './CooperativeRoutesPage.css';
import { Link } from 'react-router-dom';
import { CreateRouteModal } from '../components/CreateRouteModal';
import { ConfigureRouteModal } from '../components/ConfigureRouteModal';
import { RouteFilters, type RouteStatusFilter } from '../components/RouteFilters';
import { normalizeLocationSearch } from '../utils/normalizeLocationSearch';
import {
  getGeographicCatalog,
  type GeographicCatalog,
} from '../../geography/services/geographicCatalog.service';

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

const ROUTE_SHEET_WARNING_LABELS: Record<RouteSheetWarning, string> = {
  NO_OPERATIONAL_BUSES: 'El grupo no tiene buses operativos.',
  REST_COUNT_TOO_HIGH: 'No hay buses de repuesto: la cantidad en descanso supera la flota.',
  NO_SPARE_BUSES: 'No hay buses de repuesto para cubrir imprevistos.',
  NO_REST_BUSES: 'No se pudieron dejar todos los buses en descanso.',
  UNASSIGNED_FREQUENCIES: 'Hay salidas sin bus disponible.',
};

export function CooperativeRoutesPage() {
  const [cities, setCities] = useState<RouteCity[]>([]);
  const [geographicCatalog, setGeographicCatalog] = useState<GeographicCatalog | null>(null);
  const [routes, setRoutes] = useState<CooperativeRoute[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [seatTypes, setSeatTypes] = useState<CooperativeSeatType[]>([]);
  const [frequencies, setFrequencies] = useState<CooperativeFrequency[]>([]);
  const [plans, setPlans] = useState<Record<string, RouteSheet>>({});
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [serviceDate, setServiceDate] = useState(localDateValue);
  const [routeSearch, setRouteSearch] = useState('');
  const [routeGroupFilter, setRouteGroupFilter] = useState('all');
  const [routeStatusFilter, setRouteStatusFilter] = useState<RouteStatusFilter>('all');
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [configuringRoute, setConfiguringRoute] = useState<CooperativeRoute | null>(null);
  const [isNewRouteConfig, setIsNewRouteConfig] = useState(false);
  const newRouteButtonRef = useRef<HTMLButtonElement>(null);
  const [assignedBuses, setAssignedBuses] = useState<Record<string, Record<number, string>>>({});
  const [startingCities, setStartingCities] = useState<Record<string, Record<number, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const planKey = `${selectedGroupId}:${serviceDate}`;
  const serviceDates = useMemo(
    () => Array.from({ length: 6 }, (_, index) => dateOffset(serviceDate, index)),
    [serviceDate],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [cityResult, catalogResult, routeResult, groupResult, seatTypeResult] =
          await Promise.all([
            getRouteCities(),
            getGeographicCatalog(),
            getCooperativeRoutes(),
            getCooperativeBusGroups(),
            getCooperativeSeatTypes(),
          ]);
        if (!active) return;
        setCities(cityResult);
        setGeographicCatalog(catalogResult);
        setRoutes(routeResult);
        setGroups(groupResult);
        setSeatTypes(seatTypeResult);
        setSelectedGroupId((current) => current || String(groupResult[0]?.id ?? ''));
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible cargar las rutas de la cooperativa.',
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
    if (!selectedGroupId) return;
    void getCooperativeFrequencies(Number(selectedGroupId))
      .then((result) => {
        if (active) setFrequencies(result);
      })
      .catch(() => {
        if (active) setFrequencies([]);
      });
    return () => {
      active = false;
    };
  }, [selectedGroupId]);

  /** Solo actualiza el estado visual; NO guarda ni publica nada en el servidor. */
  const displayPlanResults = (results: RouteSheet[]) => {
    setPlans(Object.fromEntries(results.map((plan) => [plan.serviceDate, plan])));
    setAssignedBuses(
      Object.fromEntries(
        results.map((plan) => [
          plan.serviceDate,
          Object.fromEntries(
            plan.frequencies.map((frequency) => [
              frequency.frequencyId,
              frequency.busId ? String(frequency.busId) : '',
            ]),
          ),
        ]),
      ),
    );
    setStartingCities(
      Object.fromEntries(
        results.map((plan) => [
          plan.serviceDate,
          Object.fromEntries(
            plan.startingLocations.map((item) => [item.busId, String(item.cityId)]),
          ),
        ]),
      ),
    );
  };

  /**
   * Actualiza el estado visual Y guarda/publica automáticamente las hojas
   * que tienen todos los buses asignados.
   */
  const applyPlanResults = async (results: RouteSheet[], active = true) => {
    displayPlanResults(results);

    // Publicación automática de hojas generadas completas
    for (const plan of results) {
      if (
        plan.status !== 'published' &&
        plan.frequencies.length > 0 &&
        plan.frequencies.every((f) => Boolean(f.busId))
      ) {
        try {
          const saved = await saveRouteSheet({
            busGroupId: plan.busGroupId,
            serviceDate: plan.serviceDate,
            assignments: plan.frequencies.map((f) => ({
              frequencyId: f.frequencyId,
              busId: f.busId,
            })),
            startingLocations: plan.startingLocations,
            standbyBusIds: plan.standbyBuses.map((b) => b.id),
            mode: plan.mode,
          });
          if (saved.id && saved.status !== 'published') {
            const published = await publishRouteSheet(saved.id);
            if (active) {
              setPlans((current) => ({ ...current, [plan.serviceDate]: published }));
            }
          }
        } catch {
          // Ignorado si faltan tarifas
        }
      }
    }
  };

  useEffect(() => {
    let active = true;
    if (!selectedGroupId || !serviceDate) return;

    void getRouteSheetAutoPlan(Number(selectedGroupId), serviceDate, 6)
      .then((results) => {
        if (!active) return;
        displayPlanResults(results);
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
  }, [selectedGroupId, serviceDate, planKey]);

  /** Recarga los datos actuales del servidor sin forzar regeneración del plan */
  const handleRefreshPlan = async () => {
    if (!selectedGroupId || !serviceDate) return;
    setIsRecalculating(true);
    setError(null);
    try {
      const [freshFrequencies, results] = await Promise.all([
        getCooperativeFrequencies(Number(selectedGroupId)),
        getRouteSheetAutoPlan(Number(selectedGroupId), serviceDate, 6, false),
      ]);
      setFrequencies(freshFrequencies);
      displayPlanResults(results);
      setLoadedPlanKey(planKey);
      setSuccess('Hoja de ruta actualizada correctamente.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No fue posible actualizar la hoja de ruta.',
      );
    } finally {
      setIsRecalculating(false);
    }
  };

  /**
   * Fuerza la regeneración del plan automático:
   * rota buses, aplica descansos según el grupo y guarda/publica cada hoja.
   */
  const handleAutoAssign = async () => {
    if (!selectedGroupId || !serviceDate) return;
    setIsAutoAssigning(true);
    setError(null);
    try {
      const [freshFrequencies, results] = await Promise.all([
        getCooperativeFrequencies(Number(selectedGroupId)),
        getRouteSheetAutoPlan(Number(selectedGroupId), serviceDate, 6, true),
      ]);
      setFrequencies(freshFrequencies);
      await applyPlanResults(results, true);
      setLoadedPlanKey(planKey);
      setSuccess('Buses auto-asignados y buses en descanso recalculados exitosamente.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No fue posible auto-asignar los buses.',
      );
    } finally {
      setIsAutoAssigning(false);
    }
  };


  const filteredRoutes = useMemo(() => {
    const query = normalizeLocationSearch(routeSearch);
    return routes.filter((route) => {
      const haystack = normalizeLocationSearch(
        [
          route.originCity,
          route.destinationCity,
          route.busGroupName ?? '',
          ...route.stops.map((stop) => stop.cityName),
        ].join(' '),
      );
      const matchesSearch = !query || haystack.includes(query);
      const matchesGroup =
        routeGroupFilter === 'all' ||
        (routeGroupFilter === 'none'
          ? route.busGroupId === null
          : String(route.busGroupId) === routeGroupFilter);
      const matchesStatus =
        routeStatusFilter === 'all' ||
        (routeStatusFilter === 'active' ? route.isActive : !route.isActive);
      return matchesSearch && matchesGroup && matchesStatus;
    });
  }, [routes, routeSearch, routeGroupFilter, routeStatusFilter]);

  const sheetFrequencies = useMemo(() => {
    const map = new Map<number, (typeof frequencies)[number] | RouteSheet['frequencies'][number]>();
    for (const f of frequencies) {
      map.set(f.id, f);
    }
    for (const day of serviceDates) {
      const dayPlan = plans[day];
      if (dayPlan) {
        for (const f of dayPlan.frequencies) {
          if (!map.has(f.frequencyId)) {
            map.set(f.frequencyId, f);
          }
        }
      }
    }
    return Array.from(map.values())
      .map((f) => ({
        frequencyId: 'frequencyId' in f ? f.frequencyId : f.id,
        routeId: f.routeId,
        routeName: f.routeName,
        departureTime: f.departureTime,
        durationMinutes: f.durationMinutes,
        resolutionNumber: f.resolutionNumber,
        stops: f.stops,
      }))
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }, [frequencies, plans, serviceDates]);

  const isLoadingPlan = Boolean(selectedGroupId && serviceDate && loadedPlanKey !== planKey);

  const handleCloseRouteModal = () => {
    setIsRouteModalOpen(false);
    requestAnimationFrame(() => newRouteButtonRef.current?.focus());
  };

  const handleRouteCreated = (created: CooperativeRoute) => {
    setError(null);
    setRoutes((current) => [...current, created]);
    if (created.busGroupId) {
      setSelectedGroupId(String(created.busGroupId));
    }
    setSuccess(`Ruta ${created.originCity} – ${created.destinationCity} creada. Completa sus tarifas en el siguiente paso.`);
    setIsNewRouteConfig(true);
    setConfiguringRoute(created);
    void handleAutoAssign();
  };

  const handleBusAssignmentChange = async (day: string, frequencyId: number, busId: string) => {
    const updatedDayAssignments = {
      ...(assignedBuses[day] ?? {}),
      [frequencyId]: busId,
    };
    setAssignedBuses((current) => ({
      ...current,
      [day]: updatedDayAssignments,
    }));

    const plan = plans[day];
    if (!plan) return;
    const dayStartingCities = startingCities[day] ?? {};
    const dayBusIds = [
      ...new Set(Object.values(updatedDayAssignments).filter(Boolean).map(Number)),
    ].sort((first, second) => first - second);

    try {
      const saved = await saveRouteSheet({
        busGroupId: Number(selectedGroupId),
        serviceDate: day,
        assignments: plan.frequencies.map((frequency) => ({
          frequencyId: frequency.frequencyId,
          busId: updatedDayAssignments[frequency.frequencyId]
            ? Number(updatedDayAssignments[frequency.frequencyId])
            : null,
        })),
        startingLocations: dayBusIds.map((busIdNum) => ({
          busId: busIdNum,
          cityId: Number(
            dayStartingCities[busIdNum] ??
              plan.startingLocations.find((loc) => loc.busId === busIdNum)?.cityId ??
              cities[0]?.id,
          ),
        })),
        standbyBusIds: plan.standbyBuses.map((bus) => bus.id),
        mode: plan.mode,
      });

      const allAssigned = plan.frequencies.every((f) =>
        Boolean(updatedDayAssignments[f.frequencyId]),
      );
      if (allAssigned && saved.id && saved.status !== 'published') {
        const published = await publishRouteSheet(saved.id);
        setPlans((current) => ({ ...current, [day]: published }));
      } else {
        setPlans((current) => ({ ...current, [day]: saved }));
      }
    } catch (saveError) {
      console.warn('Auto-save/publish notice:', saveError);
    }
  };

  return (
    <section className="cooperative-routes" aria-labelledby="cooperative-routes-title">
      <header className="cooperative-routes__header">
        <p className="cooperative-routes__eyebrow">Planificación operativa</p>
        <h2 id="cooperative-routes-title">Rutas y frecuencias</h2>
        <p>
          Gestiona los recorridos, asigna grupos de buses con sus tarifas y revisa la hoja de ruta
          diaria automatizada.
        </p>
        <div className="cooperative-routes__header-actions">
          <button
            type="button"
            ref={newRouteButtonRef}
            onClick={() => {
              setError(null);
              setIsRouteModalOpen(true);
            }}
            disabled={isLoading || groups.length === 0}
            title={groups.length === 0 ? 'Crea primero un grupo de buses' : undefined}
          >
            Nueva ruta
          </button>
          {!isLoading && groups.length === 0 && (
            <p className="cooperative-routes__header-note">
              Crea un grupo de buses antes de registrar rutas.
            </p>
          )}
        </div>
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
          {/* BLOQUE 1 (ANTES 2): RUTAS REGISTRADAS */}
          <section className="cooperative-routes__step" aria-labelledby="routes-builder-title">
            <div className="cooperative-routes__step-heading">
              <span>1</span>
              <div>
                <h3 id="routes-builder-title">Rutas registradas</h3>
                <p>
                  Filtra por texto, grupo o estado. En cada ruta puedes pulsar Configurar para
                  asignar grupo, horarios de salida y tarifa base.
                </p>
              </div>
            </div>
            <RouteFilters
              search={routeSearch}
              group={routeGroupFilter}
              status={routeStatusFilter}
              groups={groups}
              onSearchChange={setRouteSearch}
              onGroupChange={setRouteGroupFilter}
              onStatusChange={setRouteStatusFilter}
            />
            <div className="cooperative-routes__registered">
              <h4>Listado de rutas</h4>
              {routes.length === 0 ? (
                <p className="cooperative-routes__empty">
                  Aún no se han definido rutas para esta cooperativa.
                </p>
              ) : filteredRoutes.length === 0 ? (
                <p className="cooperative-routes__empty">
                  Ninguna ruta coincide con los filtros seleccionados.
                </p>
              ) : (
                <ul>
                  {filteredRoutes.map((route) => {
                    const hasFares = route.fares.length > 0;
                    return (
                      <li key={route.id}>
                        <div className="cooperative-routes__registered-header">
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
                          <div className="cooperative-routes__registered-actions">
                            <span
                              className={`cooperative-routes__badge ${
                                route.isActive
                                  ? 'cooperative-routes__badge--success'
                                  : 'cooperative-routes__badge--muted'
                              }`}
                            >
                              {route.isActive ? 'Activa' : 'Inactiva'}
                            </span>
                            <span className="cooperative-routes__badge cooperative-routes__badge--neutral">
                              {route.busGroupName ?? 'Sin grupo'}
                            </span>
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
                              className="cooperative-routes__button cooperative-routes__button--small cooperative-routes__button--secondary"
                              onClick={() => {
                                setIsNewRouteConfig(false);
                                setConfiguringRoute(route);
                              }}
                            >
                              Configurar
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

          {/* BLOQUE 2 (ANTES 4): HOJA DE RUTA DEL GRUPO */}
          <section className="cooperative-routes__step" aria-labelledby="route-sheet-title">
            <div className="cooperative-routes__step-heading">
              <span>2</span>
              <div>
                <h3 id="route-sheet-title">Hoja de ruta del grupo</h3>
                <p>
                  Visualiza los seis días de rotación automática de buses por grupo. La asignación y
                  publicación de servicios es automática.
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
              <button
                type="button"
                className="cooperative-routes__button cooperative-routes__button--secondary cooperative-routes__button--refresh"
                onClick={() => void handleRefreshPlan()}
                disabled={isLoadingPlan || isRecalculating || isAutoAssigning || !selectedGroupId}
                title="Recarga los datos actuales del servidor, incluyendo buses en descanso"
              >
                {isRecalculating ? 'Actualizando...' : '🔄 Actualizar'}
              </button>
              <button
                type="button"
                className="cooperative-routes__button cooperative-routes__button--auto-assign"
                onClick={() => void handleAutoAssign()}
                disabled={isLoadingPlan || isRecalculating || isAutoAssigning || !selectedGroupId}
                title="Regenera el plan completo: rota buses automáticamente y aplica los descansos configurados en el grupo"
              >
                {isAutoAssigning ? 'Auto-asignando...' : '⚡ Auto-asignar buses'}
              </button>
            </div>
            <div className="cooperative-routes__sheet-meta">
              <span>
                Buses en descanso por hoja:{' '}
                <strong>
                  {groups.find((group) => String(group.id) === selectedGroupId)?.restBusesCount ??
                    plans[serviceDates[0]]?.restBusesCount ??
                    0}
                </strong>
              </span>
              <Link to="/cooperativa/grupos">Configurar en el grupo</Link>
            </div>

            {serviceDates.some((day) => plans[day]?.warnings && plans[day].warnings.length > 0) && (
              <ul className="cooperative-routes__warnings" role="alert">
                {Array.from(new Set(serviceDates.flatMap((d) => plans[d]?.warnings ?? []))).map(
                  (warning) => (
                    <li key={warning}>{ROUTE_SHEET_WARNING_LABELS[warning] ?? warning}</li>
                  ),
                )}
              </ul>
            )}

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
                <button type="button" onClick={() => void handleRefreshPlan()}>
                  Reintentar
                </button>
              </div>
            ) : sheetFrequencies.length === 0 ? (
              <p className="cooperative-routes__empty">
                Agrega frecuencias a las rutas del grupo para preparar su hoja de ruta.
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
                                  : 'Auto'}
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
                                    void handleBusAssignmentChange(
                                      day,
                                      frequency.frequencyId,
                                      event.target.value,
                                    )
                                  }
                                  disabled={!canEditBus}
                                >
                                  <option value="">Sin asignar</option>
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

                <div className="cooperative-routes__standby-summary">
                  <h5>Buses en descanso por día:</h5>
                  <div className="cooperative-routes__standby-chips">
                    {serviceDates.map((day) => {
                      const dayPlan = plans[day];
                      return (
                        <div key={day} className="cooperative-routes__standby-chip">
                          <strong>{dayLabel(day)}:</strong>
                          <span>
                            {dayPlan && dayPlan.standbyBuses.length > 0
                              ? dayPlan.standbyBuses.map((b) => `Bus ${b.number}`).join(', ')
                              : 'Sin descanso'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {isRouteModalOpen && (
        <CreateRouteModal
          groups={groups}
          catalog={geographicCatalog}
          defaultGroupId={selectedGroupId || String(groups[0]?.id ?? '')}
          onClose={handleCloseRouteModal}
          onCreated={handleRouteCreated}
        />
      )}

      {configuringRoute && (
        <ConfigureRouteModal
          route={configuringRoute}
          groups={groups}
          seatTypes={seatTypes}
          frequencies={frequencies}
          isNewRoute={isNewRouteConfig}
          onClose={() => {
            setConfiguringRoute(null);
            setIsNewRouteConfig(false);
          }}
          onUpdated={(updated) => {
            setRoutes((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            );
            setConfiguringRoute(null);
            setIsNewRouteConfig(false);
            setSuccess(`Ruta ${updated.originCity} – ${updated.destinationCity} configurada.`);
            void handleAutoAssign();
          }}
          onFrequencyCreated={(created) => {
            setFrequencies((current) =>
              [...current, created].sort((first, second) =>
                first.departureTime.localeCompare(second.departureTime),
              ),
            );
            void handleAutoAssign();
          }}
        />
      )}
    </section>
  );
}
