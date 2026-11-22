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
import { getCooperativeSeatTypes, type CooperativeSeatType } from '../services/seatType.service';
import './CooperativeRoutesPage.css';
import { Link } from 'react-router-dom';
import { CreateRouteModal } from '../components/CreateRouteModal';
import { ConfigureRouteModal } from '../components/ConfigureRouteModal';
import { RouteFilters, type RouteStatusFilter } from '../components/RouteFilters';
import {
  RouteLocationFilter,
  type RouteLocationFilterValue,
} from '../components/RouteLocationFilter';
import { normalizeLocationSearch } from '../utils/normalizeLocationSearch';
import {
  getGeographicCatalog,
  type GeographicCatalog,
} from '../../geography/services/geographicCatalog.service';

const EMPTY_LOCATION_FILTER: RouteLocationFilterValue = {
  province: '',
  canton: '',
  locality: '',
};

function matchesLocationFilter(
  city: RouteCity | undefined,
  filter: RouteLocationFilterValue,
): boolean {
  if (!filter.province && !filter.canton && !filter.locality) return true;
  if (!city) return false;
  if (filter.province && city.province !== filter.province) return false;
  if (filter.canton && city.canton !== filter.canton) return false;
  if (filter.locality && String(city.id) !== filter.locality) return false;
  return true;
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

const ROUTE_SHEET_WARNING_LABELS: Record<RouteSheetWarning, string> = {
  NO_OPERATIONAL_BUSES: 'El grupo no tiene buses operativos.',
  REST_COUNT_TOO_HIGH: 'No hay buses de repuesto: la cantidad en descanso supera la flota.',
  NO_SPARE_BUSES: 'No hay buses de repuesto para cubrir imprevistos.',
  NO_REST_BUSES: 'No se pudieron dejar todos los buses en descanso.',
  UNASSIGNED_FREQUENCIES: 'Hay salidas sin bus disponible.',
};

type PlanningView = 'routes' | 'frequencies';

interface PublishConfirmDialogProps {
  dayText: string;
  frequencyCount: number;
  restNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

function PublishConfirmDialog({
  dayText,
  frequencyCount,
  restNames,
  onConfirm,
  onCancel,
}: PublishConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="cooperative-routes__dialog"
      aria-labelledby="publish-confirm-title"
      aria-describedby="publish-confirm-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <h3 id="publish-confirm-title">Publicar la hoja del {dayText}</h3>
      <div id="publish-confirm-description">
        <p>
          Se publicarán {frequencyCount} {frequencyCount === 1 ? 'frecuencia' : 'frecuencias'} con
          sus buses asignados.
        </p>
        <p>
          {restNames.length > 0
            ? `En descanso (solo lo ve la cooperativa): ${restNames.join(', ')}.`
            : 'Ese día no hay buses en descanso.'}
        </p>
        <p>
          Una vez publicada, la hoja solo se podrá reasignar mientras ningún viaje haya salido y no
          existan reservas.
        </p>
      </div>
      <div className="cooperative-routes__dialog-actions">
        <button
          type="button"
          className="cooperative-routes__button cooperative-routes__button--secondary"
          onClick={onCancel}
          autoFocus
        >
          Cancelar
        </button>
        <button type="button" className="cooperative-routes__button" onClick={onConfirm}>
          Publicar hoja
        </button>
      </div>
    </dialog>
  );
}

export function CooperativeRoutesPage() {
  return <RoutePlanning view="routes" />;
}

export function CooperativeFrequenciesPage() {
  return <RoutePlanning view="frequencies" />;
}

function RoutePlanning({ view }: { view: PlanningView }) {
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
  const [routeOriginFilter, setRouteOriginFilter] =
    useState<RouteLocationFilterValue>(EMPTY_LOCATION_FILTER);
  const [routeDestinationFilter, setRouteDestinationFilter] =
    useState<RouteLocationFilterValue>(EMPTY_LOCATION_FILTER);
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [configuringRoute, setConfiguringRoute] = useState<CooperativeRoute | null>(null);
  const [isNewRouteConfig, setIsNewRouteConfig] = useState(false);
  const [sheetOriginFilter, setSheetOriginFilter] =
    useState<RouteLocationFilterValue>(EMPTY_LOCATION_FILTER);
  const [sheetDestinationFilter, setSheetDestinationFilter] =
    useState<RouteLocationFilterValue>(EMPTY_LOCATION_FILTER);
  const newRouteButtonRef = useRef<HTMLButtonElement>(null);
  const [assignedBuses, setAssignedBuses] = useState<Record<string, Record<number, string>>>({});
  const [standbySlots, setStandbySlots] = useState<Record<string, string[]>>({});
  const [publishingDay, setPublishingDay] = useState<string | null>(null);
  const [confirmDay, setConfirmDay] = useState<string | null>(null);
  const [daySaveState, setDaySaveState] = useState<Record<string, 'saving' | 'saved' | 'error'>>(
    {},
  );
  const publishTriggerRef = useRef<HTMLElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);
  const [loadedPlanKey, setLoadedPlanKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      setSuccess(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [success]);

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
    setStandbySlots(
      Object.fromEntries(
        results.map((plan) => [
          plan.serviceDate,
          Array.from({ length: plan.restBusesCount }, (_, index) =>
            plan.standbyBuses[index] ? String(plan.standbyBuses[index].id) : '',
          ),
        ]),
      ),
    );
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
  };

  /**
   * Actualiza el estado visual Y guarda como borrador las hojas que tienen
   * todos los buses asignados. La publicación es siempre manual.
   */
  const applyPlanResults = async (results: RouteSheet[], active = true) => {
    displayPlanResults(results);

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
          if (active) {
            setPlans((current) => ({ ...current, [plan.serviceDate]: saved }));
          }
        } catch {
          // Ignorado si faltan tarifas
        }
      }
    }
  };

  useEffect(() => {
    let active = true;
    if (view !== 'frequencies' || !selectedGroupId || !serviceDate) return;

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
  }, [view, selectedGroupId, serviceDate, planKey]);

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
      setError(err instanceof Error ? err.message : 'No fue posible actualizar la hoja de ruta.');
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
      setError(err instanceof Error ? err.message : 'No fue posible auto-asignar los buses.');
    } finally {
      setIsAutoAssigning(false);
    }
  };

  const filteredRoutes = useMemo(() => {
    const query = normalizeLocationSearch(routeSearch);
    const citiesById = new Map(cities.map((city) => [city.id, city]));
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
      const matchesOrigin = matchesLocationFilter(
        citiesById.get(route.originCityId),
        routeOriginFilter,
      );
      const matchesDestination = matchesLocationFilter(
        citiesById.get(route.destinationCityId),
        routeDestinationFilter,
      );
      return (
        matchesSearch &&
        matchesGroup &&
        matchesStatus &&
        matchesOrigin &&
        matchesDestination
      );
    });
  }, [
    routes,
    cities,
    routeSearch,
    routeGroupFilter,
    routeStatusFilter,
    routeOriginFilter,
    routeDestinationFilter,
  ]);

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
    const routesById = new Map(routes.map((r) => [r.id, r]));

    return Array.from(map.values())
      .map((f) => {
        const route = routesById.get(f.routeId);
        let originCity = route?.originCity ?? '';
        let destinationCity = route?.destinationCity ?? '';
        if ((!originCity || !destinationCity) && f.routeName) {
          const parts = f.routeName.split(/\s*[-–→]\s*/);
          if (parts.length >= 2) {
            originCity = originCity || parts[0].trim();
            destinationCity = destinationCity || parts[1].trim();
          }
        }
        return {
          frequencyId: 'frequencyId' in f ? f.frequencyId : f.id,
          routeId: f.routeId,
          routeName: f.routeName,
          originCity,
          originCityId: route?.originCityId ?? null,
          destinationCity,
          destinationCityId: route?.destinationCityId ?? null,
          departureTime: f.departureTime,
          durationMinutes: f.durationMinutes,
          resolutionNumber: f.resolutionNumber,
          stops: f.stops,
        };
      })
      .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }, [frequencies, plans, serviceDates, routes]);

  const filteredSheetFrequencies = useMemo(() => {
    const citiesById = new Map(cities.map((city) => [city.id, city]));
    return sheetFrequencies.filter((f) => {
      return (
        matchesLocationFilter(
          f.originCityId === null ? undefined : citiesById.get(f.originCityId),
          sheetOriginFilter,
        ) &&
        matchesLocationFilter(
          f.destinationCityId === null ? undefined : citiesById.get(f.destinationCityId),
          sheetDestinationFilter,
        )
      );
    });
  }, [sheetFrequencies, cities, sheetOriginFilter, sheetDestinationFilter]);

  const restBusesCount =
    groups.find((group) => String(group.id) === selectedGroupId)?.restBusesCount ??
    plans[serviceDates[0]]?.restBusesCount ??
    0;

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
    setSuccess(
      `Ruta ${created.originCity} – ${created.destinationCity} creada. Completa sus tarifas en el siguiente paso.`,
    );
    setIsNewRouteConfig(true);
    setConfiguringRoute(created);
    void handleAutoAssign();
  };

  /** Guarda como borrador la hoja de un día con las asignaciones y descansos dados. */
  const persistDayRaw = async (
    day: string,
    plan: RouteSheet,
    dayAssignments: Record<number, string>,
    standbyIds: number[],
  ) => {
    const dayBusIds = [
      ...new Set(Object.values(dayAssignments).filter(Boolean).map(Number)),
    ].sort((first, second) => first - second);

    // La ubicación inicial de cada bus es la ciudad de salida de su primer servicio del día.
    const originByRouteId = new Map(routes.map((route) => [route.id, route.originCityId]));
    const firstOriginByBus = new Map<number, number>();
    [...plan.frequencies]
      .sort((first, second) => first.departureTime.localeCompare(second.departureTime))
      .forEach((frequency) => {
        const assigned = dayAssignments[frequency.frequencyId];
        const origin = originByRouteId.get(frequency.routeId);
        if (assigned && origin !== undefined && !firstOriginByBus.has(Number(assigned))) {
          firstOriginByBus.set(Number(assigned), origin);
        }
      });

    const saved = await saveRouteSheet({
      busGroupId: Number(selectedGroupId),
      serviceDate: day,
      assignments: plan.frequencies.map((frequency) => ({
        frequencyId: frequency.frequencyId,
        busId: dayAssignments[frequency.frequencyId]
          ? Number(dayAssignments[frequency.frequencyId])
          : null,
      })),
      startingLocations: dayBusIds.map((busIdNum) => ({
        busId: busIdNum,
        cityId: Number(
          firstOriginByBus.get(busIdNum) ??
            plan.startingLocations.find((loc) => loc.busId === busIdNum)?.cityId ??
            cities[0]?.id,
        ),
      })),
      standbyBusIds: standbyIds,
      mode: plan.mode,
    });

    const result = saved;
    setPlans((current) => ({ ...current, [day]: result }));
    setStandbySlots((current) => ({
      ...current,
      [day]: Array.from({ length: result.restBusesCount }, (_, index) =>
        result.standbyBuses[index] ? String(result.standbyBuses[index].id) : '',
      ),
    }));
    return result;
  };

  const requestPublishDay = (day: string, trigger: HTMLElement) => {
    publishTriggerRef.current = trigger;
    setConfirmDay(day);
  };

  const closePublishConfirm = () => {
    setConfirmDay(null);
    const trigger = publishTriggerRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  };

  const handlePublishDay = async (day: string) => {
    const plan = plans[day];
    if (!plan) return;
    setConfirmDay(null);
    setPublishingDay(day);
    setError(null);
    try {
      const sheet = await persistDay(
        day,
        plan,
        assignedBuses[day] ?? {},
        (standbySlots[day] ?? []).filter(Boolean).map(Number),
      );
      if (!sheet.id) throw new Error('No fue posible guardar la hoja antes de publicarla.');
      const published = await publishRouteSheet(sheet.id);
      setPlans((current) => ({ ...current, [day]: published }));
      setSuccess(`Hoja del ${dayLabel(day)} publicada.`);
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'No fue posible publicar la hoja del día.',
      );
    } finally {
      setPublishingDay(null);
    }
  };

  const persistDay = async (
    day: string,
    plan: RouteSheet,
    dayAssignments: Record<number, string>,
    standbyIds: number[],
  ): Promise<RouteSheet> => {
    setDaySaveState((current) => ({ ...current, [day]: 'saving' }));
    try {
      const result = await persistDayRaw(day, plan, dayAssignments, standbyIds);
      setDaySaveState((current) => ({ ...current, [day]: 'saved' }));
      setTimeout(() => {
        setDaySaveState((current) => {
          if (current[day] !== 'saved') return current;
          const next = { ...current };
          delete next[day];
          return next;
        });
      }, 2500);
      return result;
    } catch (saveError) {
      setDaySaveState((current) => ({ ...current, [day]: 'error' }));
      throw saveError;
    }
  };

  /** Motivo por el que un bus no se puede elegir en una frecuencia ese día. */
  const frequencyBusBlock = (
    day: string,
    bus: RouteSheet['buses'][number],
    frequencyId: number,
  ) => {
    if (!bus.isActive || bus.status !== 'operativo') return bus.status.replaceAll('_', ' ');
    if ((standbySlots[day] ?? []).includes(String(bus.id))) return 'en descanso';
    const usedElsewhere = Object.entries(assignedBuses[day] ?? {}).some(
      ([otherId, otherBus]) => otherBus === String(bus.id) && Number(otherId) !== frequencyId,
    );
    return usedElsewhere ? 'ya asignado' : null;
  };

  /** Motivo por el que un bus no se puede elegir como descanso ese día. */
  const restBusBlock = (day: string, bus: RouteSheet['buses'][number], slotIndex: number) => {
    if (!bus.isActive || bus.status !== 'operativo') return bus.status.replaceAll('_', ' ');
    if (Object.values(assignedBuses[day] ?? {}).includes(String(bus.id))) {
      return 'en una frecuencia';
    }
    const inOtherSlot = (standbySlots[day] ?? []).some(
      (id, index) => id === String(bus.id) && index !== slotIndex,
    );
    return inOtherSlot ? 'en otro descanso' : null;
  };

  const dayStatus = (day: string): { label: string; tone: 'published' | 'draft' | 'proposal' } => {
    const status = plans[day]?.status;
    if (status === 'published') return { label: 'Publicada', tone: 'published' };
    if (status === 'draft') return { label: 'Borrador', tone: 'draft' };
    return { label: 'Propuesta', tone: 'proposal' };
  };

  const handleBusAssignmentChange = async (day: string, frequencyId: number, busId: string) => {
    const updatedDayAssignments = {
      ...(assignedBuses[day] ?? {}),
      [frequencyId]: busId,
    };
    const plan = plans[day];
    if (busId && (standbySlots[day] ?? []).includes(busId)) {
      setError('Ese bus está en descanso este día; no puede asignarse a una frecuencia.');
      return;
    }
    setAssignedBuses((current) => ({
      ...current,
      [day]: updatedDayAssignments,
    }));
    if (!plan) return;

    const previousAssignments = assignedBuses[day] ?? {};
    try {
      await persistDay(
        day,
        plan,
        updatedDayAssignments,
        (standbySlots[day] ?? []).filter(Boolean).map(Number),
      );
    } catch (saveError) {
      setAssignedBuses((current) => ({ ...current, [day]: previousAssignments }));
      setError(
        saveError instanceof Error ? saveError.message : 'No fue posible guardar la asignación.',
      );
    }
  };

  const handleStandbyChange = async (day: string, slotIndex: number, busId: string) => {
    const plan = plans[day];
    if (!plan) return;
    const previousSlots = standbySlots[day] ?? [];
    const dayAssignments = assignedBuses[day] ?? {};
    if (busId && previousSlots.some((id, index) => id === busId && index !== slotIndex)) {
      setError('Un mismo bus no puede estar dos veces en descanso el mismo día.');
      return;
    }
    if (busId && Object.values(dayAssignments).includes(busId)) {
      setError('Ese bus ya tiene una frecuencia asignada este día; no puede quedar en descanso.');
      return;
    }
    const nextSlots = previousSlots.map((id, index) => (index === slotIndex ? busId : id));
    setStandbySlots((current) => ({ ...current, [day]: nextSlots }));
    setError(null);
    try {
      await persistDay(day, plan, dayAssignments, nextSlots.filter(Boolean).map(Number));
    } catch (saveError) {
      setStandbySlots((current) => ({ ...current, [day]: previousSlots }));
      setError(
        saveError instanceof Error ? saveError.message : 'No fue posible guardar el descanso.',
      );
    }
  };

  return (
    <section className="cooperative-routes" aria-labelledby="cooperative-routes-title">
      <header className="cooperative-routes__header">
        <p className="cooperative-routes__eyebrow">Planificación operativa</p>
        <h2 id="cooperative-routes-title">{view === 'routes' ? 'Rutas' : 'Frecuencias'}</h2>
        <p>
          {view === 'routes'
            ? 'Gestiona los recorridos y asigna grupos de buses con sus tarifas.'
            : 'Revisa la hoja de ruta diaria de cada grupo, con sus buses y descansos.'}
        </p>
        {view === 'routes' && (
        <div className="cooperative-routes__header-actions">
          <button
            type="button"
            className="cooperative-routes__button cooperative-routes__button--icon"
            ref={newRouteButtonRef}
            onClick={() => {
              setError(null);
              setIsRouteModalOpen(true);
            }}
            disabled={isLoading || groups.length === 0}
            title={groups.length === 0 ? 'Crea primero un grupo de buses' : undefined}
          >
            <span className="cooperative-routes__btn-icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            Nueva ruta
          </button>
          {!isLoading && groups.length === 0 && (
            <p className="cooperative-routes__header-note">
              Crea un grupo de buses antes de registrar rutas.
            </p>
          )}
        </div>
        )}
      </header>

      {/* Notificaciones flotantes / modales emergentes */}
      {(error || success) && (
        <div
          className="cooperative-routes__toast-container"
          role="region"
          aria-label="Notificaciones"
        >
          {error && (
            <div
              className="cooperative-routes__toast cooperative-routes__toast--error"
              role="alert"
            >
              <span className="cooperative-routes__toast-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
              <div className="cooperative-routes__toast-content">
                <strong className="cooperative-routes__toast-title">Atención</strong>
                <p className="cooperative-routes__toast-message">{error}</p>
              </div>
              <button
                type="button"
                className="cooperative-routes__toast-close"
                onClick={() => setError(null)}
                aria-label="Cerrar notificación"
              >
                ×
              </button>
            </div>
          )}
          {success && (
            <div
              className="cooperative-routes__toast cooperative-routes__toast--success"
              role="status"
            >
              <span className="cooperative-routes__toast-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <div className="cooperative-routes__toast-content">
                <strong className="cooperative-routes__toast-title">Éxito</strong>
                <p className="cooperative-routes__toast-message">{success}</p>
              </div>
              <button
                type="button"
                className="cooperative-routes__toast-close"
                onClick={() => setSuccess(null)}
                aria-label="Cerrar notificación"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p role="status">Cargando rutas, catálogo geográfico y grupos...</p>
      ) : (
        <>
          {/* RUTAS REGISTRADAS */}
          {view === 'routes' && (
          <section className="cooperative-routes__step" aria-labelledby="routes-builder-title">
            <div className="cooperative-routes__step-heading">
              <h3 id="routes-builder-title">Rutas registradas</h3>
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
            <div className="cooperative-routes__location-filter-grid">
              <RouteLocationFilter
                title="Filtrar origen"
                catalog={geographicCatalog}
                value={routeOriginFilter}
                onChange={setRouteOriginFilter}
              />
              <RouteLocationFilter
                title="Filtrar destino"
                catalog={geographicCatalog}
                value={routeDestinationFilter}
                onChange={setRouteDestinationFilter}
              />
            </div>
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
                              className="cooperative-routes__button cooperative-routes__button--small cooperative-routes__button--secondary cooperative-routes__button--icon"
                              onClick={() => {
                                setIsNewRouteConfig(false);
                                setConfiguringRoute(route);
                              }}
                              title="Configurar grupo, horarios y tarifas de esta ruta"
                            >
                              <span className="cooperative-routes__btn-icon" aria-hidden="true">
                                <svg
                                  viewBox="0 0 24 24"
                                  width="14"
                                  height="14"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="12" r="3" />
                                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                              </span>
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

          )}

          {/* FRECUENCIAS: HOJA DE RUTA DEL GRUPO */}
          {view === 'frequencies' && (
          <section className="cooperative-routes__step" aria-labelledby="route-sheet-title">
            <div className="cooperative-routes__step-heading">
              <h3 id="route-sheet-title">Hoja de ruta del grupo</h3>
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
                    setSheetOriginFilter(EMPTY_LOCATION_FILTER);
                    setSheetDestinationFilter(EMPTY_LOCATION_FILTER);
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
                  }}
                />
              </label>
              <button
                type="button"
                className="cooperative-routes__button cooperative-routes__button--secondary cooperative-routes__button--refresh cooperative-routes__button--icon"
                onClick={() => void handleRefreshPlan()}
                disabled={isLoadingPlan || isRecalculating || isAutoAssigning || !selectedGroupId}
                title="Recarga los datos actuales del servidor"
              >
                <span className="cooperative-routes__btn-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
                  </svg>
                </span>
                {isRecalculating ? 'Actualizando...' : 'Actualizar'}
              </button>
              <button
                type="button"
                className="cooperative-routes__button cooperative-routes__button--auto-assign cooperative-routes__button--icon"
                onClick={() => void handleAutoAssign()}
                disabled={isLoadingPlan || isRecalculating || isAutoAssigning || !selectedGroupId}
                title="Regenera el plan completo: rotación de buses y descansos del grupo"
              >
                <span className="cooperative-routes__btn-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                {isAutoAssigning ? 'Auto-asignando...' : 'Auto-asignar buses'}
              </button>
            </div>
            <div className="cooperative-routes__location-filter-grid">
              <RouteLocationFilter
                title="Filtrar origen"
                catalog={geographicCatalog}
                value={sheetOriginFilter}
                onChange={setSheetOriginFilter}
              />
              <RouteLocationFilter
                title="Filtrar destino"
                catalog={geographicCatalog}
                value={sheetDestinationFilter}
                onChange={setSheetDestinationFilter}
              />
            </div>
            <div className="cooperative-routes__sheet-meta">
              <span>
                Buses en descanso por hoja: <strong>{restBusesCount}</strong>
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
                <div
                  className="cooperative-routes__table-wrap"
                  role="region"
                  aria-labelledby="route-sheet-caption"
                  tabIndex={0}
                >
                  <table className="cooperative-routes__sheet-table cooperative-routes__week-table">
                    <caption id="route-sheet-caption" className="cooperative-routes__sr-only">
                      Hoja de ruta semanal del grupo: bus asignado a cada frecuencia por día,
                      buses en descanso y publicación de cada día
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Origen – destino</th>
                        <th scope="col">Salida</th>
                        <th scope="col">Subrutas</th>
                        {serviceDates.map((day) => {
                          const status = dayStatus(day);
                          const saveState = daySaveState[day];
                          return (
                            <th scope="col" key={day}>
                              <span>{dayLabel(day)}</span>
                              <small
                                className="cooperative-routes__day-status"
                                data-tone={status.tone}
                              >
                                <span aria-hidden="true">
                                  {status.tone === 'published'
                                    ? '✓ '
                                    : status.tone === 'draft'
                                      ? '✎ '
                                      : '◌ '}
                                </span>
                                {status.label}
                              </small>
                              <small
                                className="cooperative-routes__save-state"
                                data-state={saveState ?? 'idle'}
                                aria-live="polite"
                              >
                                {saveState === 'saving'
                                  ? 'Guardando…'
                                  : saveState === 'saved'
                                    ? 'Guardado'
                                    : saveState === 'error'
                                      ? 'No se guardó'
                                      : ''}
                              </small>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSheetFrequencies.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3 + serviceDates.length}
                            style={{ textAlign: 'center', padding: '2rem 1rem' }}
                          >
                            No hay frecuencias que coincidan con el origen y destino seleccionados.
                          </td>
                        </tr>
                      ) : (
                        filteredSheetFrequencies.map((frequency) => (
                          <tr key={frequency.frequencyId}>
                            <th scope="row">
                              <strong>{frequency.routeName}</strong>
                              <small>{frequency.resolutionNumber}</small>
                            </th>
                            <td data-label="Salida">{displayTime(frequency.departureTime)}</td>
                            <td data-label="Subrutas">
                              {frequency.stops.length
                                ? frequency.stops.join(' → ')
                                : 'Sin paradas intermedias'}
                            </td>
                            {serviceDates.map((day) => {
                              const dayPlan = plans[day];
                              const isPublished = dayPlan?.status === 'published';
                              const canEditBus = !isPublished || dayPlan.canReassign;
                              return (
                                <td key={day} data-label={dayLabel(day)}>
                                  <select
                                    aria-label={`${frequency.routeName} ${dayLabel(day)}`}
                                    aria-busy={daySaveState[day] === 'saving'}
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
                                    {dayPlan?.buses.map((bus) => {
                                      const blocked = frequencyBusBlock(
                                        day,
                                        bus,
                                        frequency.frequencyId,
                                      );
                                      return (
                                        <option value={bus.id} key={bus.id} disabled={!!blocked}>
                                          Bus {bus.number}
                                          {blocked ? ` · ${blocked}` : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                      {Array.from({ length: restBusesCount }, (_, index) => (
                        <tr key={`rest-${index}`} className="cooperative-routes__rest-row">
                          <th scope="row">
                            <strong>Descanso</strong>
                            <small>Solo visible para la cooperativa</small>
                          </th>
                          <td className="cooperative-routes__filler">—</td>
                          <td className="cooperative-routes__filler">—</td>
                          {serviceDates.map((day) => {
                            const dayPlan = plans[day];
                            const slots = standbySlots[day] ?? [];
                            const canEditRest =
                              dayPlan?.status !== 'published' || Boolean(dayPlan?.canReassign);
                            return (
                              <td key={day} data-label={dayLabel(day)}>
                                <select
                                  aria-label={`Descanso ${index + 1} ${dayLabel(day)}`}
                                  aria-busy={daySaveState[day] === 'saving'}
                                  value={slots[index] ?? ''}
                                  onChange={(event) =>
                                    void handleStandbyChange(day, index, event.target.value)
                                  }
                                  disabled={!canEditRest}
                                >
                                  <option value="">Sin asignar</option>
                                  {dayPlan?.buses.map((bus) => {
                                    const blocked = restBusBlock(day, bus, index);
                                    return (
                                      <option value={bus.id} key={bus.id} disabled={!!blocked}>
                                        Bus {bus.number}
                                        {blocked ? ` · ${blocked}` : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="cooperative-routes__publish-row">
                        <th scope="row">
                          <strong>Publicar hoja</strong>
                          <small>Una vez por día</small>
                        </th>
                        <td className="cooperative-routes__filler">—</td>
                        <td className="cooperative-routes__filler">—</td>
                        {serviceDates.map((day) => {
                          const dayPlan = plans[day];
                          const isPublished = dayPlan?.status === 'published';
                          const total = dayPlan?.frequencies.length ?? 0;
                          const assignedCount =
                            dayPlan?.frequencies.filter((frequency) =>
                              Boolean(assignedBuses[day]?.[frequency.frequencyId]),
                            ).length ?? 0;
                          const missing = total - assignedCount;
                          const canPublish = total > 0 && missing === 0;
                          return (
                            <td key={day} data-label={dayLabel(day)}>
                              {isPublished ? (
                                <span className="cooperative-routes__badge cooperative-routes__badge--success">
                                  ✓ Publicada
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="cooperative-routes__button cooperative-routes__button--small"
                                    onClick={(event) =>
                                      requestPublishDay(day, event.currentTarget)
                                    }
                                    disabled={!canPublish || publishingDay !== null}
                                    aria-describedby={`publish-hint-${day}`}
                                  >
                                    {publishingDay === day ? 'Publicando...' : 'Publicar'}
                                  </button>
                                  <small
                                    id={`publish-hint-${day}`}
                                    className="cooperative-routes__hint"
                                  >
                                    {total === 0
                                      ? 'Sin frecuencias'
                                      : missing > 0
                                        ? `Falta${missing === 1 ? '' : 'n'} ${missing} por asignar`
                                        : 'Lista para publicar'}
                                  </small>
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
          )}
        </>
      )}

      {confirmDay && plans[confirmDay] && (
        <PublishConfirmDialog
          dayText={dayLabel(confirmDay)}
          frequencyCount={plans[confirmDay].frequencies.length}
          restNames={(standbySlots[confirmDay] ?? [])
            .filter(Boolean)
            .map((id) => plans[confirmDay].buses.find((bus) => String(bus.id) === id)?.number)
            .filter((number): number is string => Boolean(number))
            .map((number) => `Bus ${number}`)}
          onConfirm={() => void handlePublishDay(confirmDay)}
          onCancel={closePublishConfirm}
        />
      )}

      {view === 'routes' && isRouteModalOpen && (
        <CreateRouteModal
          groups={groups}
          catalog={geographicCatalog}
          defaultGroupId={selectedGroupId || String(groups[0]?.id ?? '')}
          onClose={handleCloseRouteModal}
          onCreated={handleRouteCreated}
        />
      )}

      {view === 'routes' && configuringRoute && (
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
