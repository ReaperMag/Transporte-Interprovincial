import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { CooperativeBusGroup } from '../services/busGroup.service';
import type { CooperativeSeatType } from '../services/seatType.service';
import {
  createCooperativeFrequency,
  saveCooperativeRouteFares,
  updateCooperativeRoute,
  type CooperativeFrequency,
  type CooperativeRoute,
} from '../services/routeSchedule.service';

interface ConfigureRouteModalProps {
  route: CooperativeRoute;
  groups: CooperativeBusGroup[];
  seatTypes: CooperativeSeatType[];
  frequencies: CooperativeFrequency[];
  isNewRoute?: boolean;
  onClose: () => void;
  onUpdated: (updatedRoute: CooperativeRoute) => void;
  onFrequencyCreated: (frequency: CooperativeFrequency) => void;
}

export function ConfigureRouteModal({
  route,
  groups,
  seatTypes,
  frequencies,
  isNewRoute = false,
  onClose,
  onUpdated,
  onFrequencyCreated,
}: ConfigureRouteModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const [selectedGroupId, setSelectedGroupId] = useState(
    route.busGroupId ? String(route.busGroupId) : String(groups[0]?.id ?? ''),
  );

  const vipType =
    seatTypes.find((item) => item.name.toLowerCase().includes('vip')) ??
    seatTypes.find((item) => Number(item.percentage) > 0) ??
    null;
  const vipPercentage = vipType ? Number(vipType.percentage) : 15;

  const segments = useMemo(() => {
    const cityIds = [
      route.originCityId,
      ...route.stops.map((stop) => stop.cityId),
      route.destinationCityId,
    ];
    const cityName = (cityId: number) => {
      if (cityId === route.originCityId) return route.originCity;
      if (cityId === route.destinationCityId) return route.destinationCity;
      return route.stops.find((s) => s.cityId === cityId)?.cityName ?? `Ciudad ${cityId}`;
    };
    const list: Array<{ originCityId: number; destinationCityId: number; label: string }> = [];
    for (let origin = 0; origin < cityIds.length; origin += 1) {
      for (let destination = origin + 1; destination < cityIds.length; destination += 1) {
        list.push({
          originCityId: cityIds[origin],
          destinationCityId: cityIds[destination],
          label: `${cityName(cityIds[origin])} → ${cityName(cityIds[destination])}`,
        });
      }
    }
    return list;
  }, [route]);

  const [normalPrices, setNormalPrices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const segment of segments) {
      const existing = route.fares.find(
        (fare) =>
          fare.originCityId === segment.originCityId &&
          fare.destinationCityId === segment.destinationCityId &&
          fare.seatType === 'normal',
      );
      if (existing) {
        initial[`${segment.originCityId}:${segment.destinationCityId}`] = String(existing.price);
      }
    }
    return initial;
  });

  const [frequencyTime, setFrequencyTime] = useState('08:00');
  const [resolutionNumber, setResolutionNumber] = useState('');
  const [isAddingFrequency, setIsAddingFrequency] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => {
      setSuccess(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  const routeFrequencies = useMemo(
    () => frequencies.filter((frequency) => frequency.routeId === route.id),
    [frequencies, route.id],
  );

  const calculateVipPrice = (priceStr: string): string => {
    const num = parseFloat(priceStr);
    if (isNaN(num) || num <= 0) return '—';
    const vip = num * (1 + vipPercentage / 100);
    return `$${vip.toFixed(2)}`;
  };

  const handleAddFrequency = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId) {
      setError('Primero asigna un grupo de buses a la ruta.');
      return;
    }
    setIsAddingFrequency(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createCooperativeFrequency({
        routeId: route.id,
        busGroupId: Number(selectedGroupId),
        departureTime: frequencyTime,
        resolutionNumber: resolutionNumber.trim(),
      });
      onFrequencyCreated(created);
      setResolutionNumber('');
      setSuccess(`Frecuencia de las ${frequencyTime} agregada.`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'No fue posible agregar la frecuencia.',
      );
    } finally {
      setIsAddingFrequency(false);
    }
  };

  const handleSaveConfiguration = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let currentRoute = route;

      // 1. Asignar grupo si cambió o no tenía
      if (selectedGroupId && Number(selectedGroupId) !== route.busGroupId) {
        currentRoute = await updateCooperativeRoute(route.id, {
          busGroupId: Number(selectedGroupId),
        });
      }

      // 2. Guardar tarifas de asiento normal (y calcular asiento VIP con el porcentaje cooperativa)
      const faresToSave: Array<{
        originCityId: number;
        destinationCityId: number;
        seatType: 'normal' | 'vip';
        price: number;
      }> = [];

      for (const segment of segments) {
        const key = `${segment.originCityId}:${segment.destinationCityId}`;
        const priceValue = parseFloat(normalPrices[key] || '');
        if (!isNaN(priceValue) && priceValue > 0) {
          faresToSave.push({
            originCityId: segment.originCityId,
            destinationCityId: segment.destinationCityId,
            seatType: 'normal',
            price: priceValue,
          });
          const vipPrice = Number((priceValue * (1 + vipPercentage / 100)).toFixed(2));
          faresToSave.push({
            originCityId: segment.originCityId,
            destinationCityId: segment.destinationCityId,
            seatType: 'vip',
            price: vipPrice,
          });
        }
      }

      if (faresToSave.length > 0) {
        currentRoute = await saveCooperativeRouteFares(route.id, faresToSave);
      }

      onUpdated(currentRoute);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No fue posible guardar la configuración de la ruta.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="cooperative-routes__modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="cooperative-routes__modal cooperative-routes__modal--configure"
        role="dialog"
        aria-modal="true"
        aria-labelledby="configure-route-title"
        ref={dialogRef}
      >
        <header className="cooperative-routes__modal-header">
          <div>
            {isNewRoute && (
              <div className="cooperative-routes__modal-steps">
                <span className="cooperative-routes__modal-step cooperative-routes__modal-step--completed">
                  ✓ Paso 1: Recorrido creado
                </span>
                <span className="cooperative-routes__modal-step-arrow">→</span>
                <span className="cooperative-routes__modal-step cooperative-routes__modal-step--active">
                  Paso 2: Tarifas y horarios
                </span>
              </div>
            )}
            <h3 id="configure-route-title">
              {isNewRoute ? 'Establecer tarifas y horarios: ' : 'Configurar ruta: '}
              {route.originCity} – {route.destinationCity}
            </h3>
            <p>
              {isNewRoute
                ? 'La ruta ha sido creada. Ahora define la tarifa base (asiento normal) y los horarios de salida.'
                : 'Asigna el grupo de buses, gestiona sus horarios de salida y define la tarifa base (asiento normal).'}
            </p>
          </div>
          <button
            type="button"
            className="cooperative-routes__modal-close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        {/* Notificaciones flotantes del modal */}
        {(error || success) && (
          <div className="cooperative-routes__toast-container" style={{ position: 'absolute', top: '1rem', right: '1rem', maxWidth: 'calc(100% - 2rem)' }}>
            {error && (
              <div className="cooperative-routes__toast cooperative-routes__toast--error" role="alert">
                <span className="cooperative-routes__toast-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              <div className="cooperative-routes__toast cooperative-routes__toast--success" role="status">
                <span className="cooperative-routes__toast-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

        <form onSubmit={(event) => void handleSaveConfiguration(event)}>
          {/* SECCIÓN 1: ASIGNACIÓN DE GRUPO */}
          <div className="cooperative-routes__config-section">
            <h4>1. Grupo de buses asignado</h4>
            <label>
              Grupo de buses
              <select
                ref={firstFieldRef}
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                required
              >
                <option value="">Selecciona un grupo</option>
                {groups.map((group) => (
                  <option value={group.id} key={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* SECCIÓN 2: TARIFAS DE LA RUTA */}
          <div className="cooperative-routes__config-section">
            <h4>2. Tarifas por tramo</h4>
            <p className="cooperative-routes__config-desc">
              Tarifa base (asiento normal). El asiento VIP suma automáticamente el +{vipPercentage}%.
            </p>
            <div className="cooperative-routes__fare-grid">
              <div className="cooperative-routes__fare-row cooperative-routes__fare-row--head">
                <span>Tramo</span>
                <span>Asiento Normal ($)</span>
                <span>Asiento VIP (+{vipPercentage}%)</span>
              </div>
              {segments.map((segment) => {
                const key = `${segment.originCityId}:${segment.destinationCityId}`;
                const normalValue = normalPrices[key] ?? '';
                return (
                  <div className="cooperative-routes__fare-row" key={key}>
                    <span>{segment.label}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      step={0.01}
                      placeholder="0.00"
                      aria-label={`Tarifa normal ${segment.label}`}
                      value={normalValue}
                      onChange={(event) =>
                        setNormalPrices((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      required
                    />
                    <span className="cooperative-routes__fare-preview">
                      {calculateVipPrice(normalValue)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="cooperative-routes__form-actions">
            <button type="button" onClick={onClose} disabled={isSaving}>
              {isNewRoute ? 'Omitir por ahora' : 'Cerrar'}
            </button>
            <button type="submit" disabled={isSaving || !selectedGroupId}>
              {isSaving
                ? 'Guardando configuración...'
                : isNewRoute
                  ? 'Guardar tarifas y finalizar'
                  : 'Guardar configuración'}
            </button>
          </div>
        </form>

        {/* SECCIÓN 3: FRECUENCIAS DE LA RUTA */}
        <div className="cooperative-routes__config-section cooperative-routes__config-section--frequencies">
          <h4>3. Horarios y frecuencias de esta ruta</h4>
          <form
            className="cooperative-routes__mini-form"
            onSubmit={(event) => void handleAddFrequency(event)}
          >
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
                placeholder="Ej. ANT-08:00"
                maxLength={50}
                required
              />
            </label>
            <button
              type="submit"
              className="cooperative-routes__button cooperative-routes__button--secondary cooperative-routes__button--icon"
              disabled={isAddingFrequency || !selectedGroupId}
            >
              <span className="cooperative-routes__btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              {isAddingFrequency ? 'Agregando...' : 'Agregar salida'}
            </button>
          </form>

          {routeFrequencies.length === 0 ? (
            <p className="cooperative-routes__empty">
              Esta ruta aún no tiene frecuencias registradas.
            </p>
          ) : (
            <ul className="cooperative-routes__modal-frequency-list">
              {routeFrequencies.map((freq) => (
                <li key={freq.id}>
                  <strong>{freq.departureTime.slice(0, 5)}</strong>
                  <span>{freq.routeName}</span>
                  <small>{freq.resolutionNumber}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
