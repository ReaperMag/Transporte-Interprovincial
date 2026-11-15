import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GeographicCatalog } from '../../geography/services/geographicCatalog.service';
import type { CooperativeBusGroup } from '../services/busGroup.service';
import {
  createCooperativeRoute,
  type CooperativeRoute,
} from '../services/routeSchedule.service';
import { preventNonNumericKeys } from '../../../shared/utils/validation';
import { normalizeLocationSearch } from '../utils/normalizeLocationSearch';
import { RouteLocationPicker } from './RouteLocationPicker';

interface RouteStopDraft {
  cityId: string;
  minutes: string;
  province: string;
  canton: string;
  search: string;
}

interface CreateRouteModalProps {
  groups: CooperativeBusGroup[];
  catalog: GeographicCatalog | null;
  defaultGroupId: string;
  onClose: () => void;
  onCreated: (route: CooperativeRoute) => void;
}

function findLocality(catalog: GeographicCatalog | null, name: string, excludeId?: number) {
  return catalog?.localities.find(
    (city) => city.id !== excludeId && normalizeLocationSearch(city.name) === name,
  );
}

export function CreateRouteModal({
  groups,
  catalog,
  defaultGroupId,
  onClose,
  onCreated,
}: CreateRouteModalProps) {
  const initialOrigin = findLocality(catalog, 'ambato') ?? catalog?.localities[0];
  const initialDestination =
    findLocality(catalog, 'quito', initialOrigin?.id) ??
    catalog?.localities.find((city) => city.id !== initialOrigin?.id);

  const [groupId, setGroupId] = useState(defaultGroupId);
  const [originProvince, setOriginProvince] = useState(initialOrigin?.province ?? '');
  const [originCanton, setOriginCanton] = useState(initialOrigin?.canton ?? '');
  const [originSearch, setOriginSearch] = useState('');
  const [originCityId, setOriginCityId] = useState(String(initialOrigin?.id ?? ''));
  const [destinationProvince, setDestinationProvince] = useState(
    initialDestination?.province ?? '',
  );
  const [destinationCanton, setDestinationCanton] = useState(initialDestination?.canton ?? '');
  const [destinationSearch, setDestinationSearch] = useState('');
  const [destinationCityId, setDestinationCityId] = useState(
    String(initialDestination?.id ?? ''),
  );
  const [duration, setDuration] = useState('240');
  const [stops, setStops] = useState<RouteStopDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [error]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  const updateStop = (index: number, patch: Partial<RouteStopDraft>) => {
    setStops((current) =>
      current.map((stop, stopIndex) => (stopIndex === index ? { ...stop, ...patch } : stop)),
    );
  };

  const validate = (): string | null => {
    if (!groupId) return 'Selecciona el grupo de buses de la ruta.';
    if (!originProvince || !originCanton || !originCityId) {
      return 'Selecciona la provincia, cantón y localidad de origen.';
    }
    if (!destinationProvince || !destinationCanton || !destinationCityId) {
      return 'Selecciona la provincia, cantón y localidad de destino.';
    }
    if (originCityId === destinationCityId) {
      return 'El origen y el destino deben ser diferentes.';
    }
    const durationMinutes = Number(duration);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 1440) {
      return 'La duración debe estar entre 10 y 1440 minutos.';
    }

    const usedCities = new Set([originCityId, destinationCityId]);
    let previousMinutes = 0;
    for (const [index, stop] of stops.entries()) {
      if (!stop.province || !stop.canton || !stop.cityId) {
        return `Selecciona la provincia y cantón de la parada ${index + 1}.`;
      }
      if (usedCities.has(stop.cityId)) {
        return `La parada ${index + 1} repite una localidad del recorrido.`;
      }
      usedCities.add(stop.cityId);
      const minutes = Number(stop.minutes);
      if (!Number.isInteger(minutes) || minutes < 1) {
        return `Indica los minutos de la parada ${index + 1}.`;
      }
      if (minutes <= previousMinutes) {
        return 'Las paradas deben ir en orden creciente de minutos.';
      }
      if (minutes >= durationMinutes) {
        return 'Cada parada debe ocurrir antes de la llegada al destino.';
      }
      previousMinutes = minutes;
    }
    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createCooperativeRoute({
        busGroupId: Number(groupId),
        originCityId: Number(originCityId),
        destinationCityId: Number(destinationCityId),
        durationMinutes: Number(duration),
        stops: stops.map((stop) => ({
          cityId: Number(stop.cityId),
          minutesFromOrigin: Number(stop.minutes),
        })),
      });
      onCreated(created);
      onClose();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No fue posible crear la ruta.',
      );
    } finally {
      setIsSubmitting(false);
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
        className="cooperative-routes__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-route-title"
        ref={dialogRef}
      >
        <header className="cooperative-routes__modal-header">
          <div>
            <div className="cooperative-routes__modal-steps">
              <span className="cooperative-routes__modal-step cooperative-routes__modal-step--active">
                Paso 1: Recorrido y paradas
              </span>
              <span className="cooperative-routes__modal-step-arrow">→</span>
              <span className="cooperative-routes__modal-step">
                Paso 2: Tarifas y horarios
              </span>
            </div>
            <h3 id="create-route-title">Nueva ruta</h3>
            <p>Asigna el grupo de buses y define el recorrido con sus paradas.</p>
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

        <form className="cooperative-routes__form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Grupo de buses
            <select
              ref={firstFieldRef}
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
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

          <div className="cooperative-routes__location-grid">
            <RouteLocationPicker
              title="Origen"
              provinces={catalog?.provinces ?? []}
              cantons={catalog?.cantons ?? []}
              localities={catalog?.localities ?? []}
              province={originProvince}
              canton={originCanton}
              search={originSearch}
              value={originCityId}
              showLocality
              excludedIds={[destinationCityId, ...stops.map((stop) => stop.cityId)]}
              onProvinceChange={(value) => {
                setOriginProvince(value);
                setOriginCanton('');
                setOriginSearch('');
                setOriginCityId('');
              }}
              onCantonChange={(value) => {
                setOriginCanton(value);
                setOriginSearch('');
              }}
              onSearchChange={(value) => {
                setOriginSearch(value);
              }}
              onValueChange={(value) => {
                setOriginCityId(value);
                if (value && value === destinationCityId) setDestinationCityId('');
              }}
            />
            <RouteLocationPicker
              title="Destino"
              provinces={catalog?.provinces ?? []}
              cantons={catalog?.cantons ?? []}
              localities={catalog?.localities ?? []}
              province={destinationProvince}
              canton={destinationCanton}
              search={destinationSearch}
              value={destinationCityId}
              showLocality
              excludedIds={[originCityId, ...stops.map((stop) => stop.cityId)]}
              onProvinceChange={(value) => {
                setDestinationProvince(value);
                setDestinationCanton('');
                setDestinationSearch('');
                setDestinationCityId('');
              }}
              onCantonChange={(value) => {
                setDestinationCanton(value);
                setDestinationSearch('');
              }}
              onSearchChange={(value) => {
                setDestinationSearch(value);
              }}
              onValueChange={(value) => {
                setDestinationCityId(value);
                if (value && value === originCityId) setOriginCityId('');
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
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
            />
          </label>

          {stops.length > 0 && (
            <div className="cooperative-routes__stop-list">
              <h4>Paradas en orden</h4>
              {stops.map((stop, index) => (
                <div className="cooperative-routes__stop-row" key={index}>
                  <span className="cooperative-routes__stop-number">{index + 1}</span>
                  <RouteLocationPicker
                    title={`Ubicación de la parada ${index + 1}`}
                    provinces={catalog?.provinces ?? []}
                    cantons={catalog?.cantons ?? []}
                    localities={catalog?.localities ?? []}
                    province={stop.province}
                    canton={stop.canton}
                    search={stop.search}
                    value={stop.cityId}
                    showLocality
                    excludedIds={[
                      originCityId,
                      destinationCityId,
                      ...stops
                        .filter((_, stopIndex) => stopIndex !== index)
                        .map((otherStop) => otherStop.cityId),
                    ]}
                    onProvinceChange={(value) =>
                      updateStop(index, {
                        province: value,
                        canton: '',
                        cityId: '',
                        search: '',
                      })
                    }
                    onCantonChange={(value) =>
                      updateStop(index, { canton: value, search: '' })
                    }
                    onSearchChange={(value) => updateStop(index, { search: value })}
                    onValueChange={(value) => updateStop(index, { cityId: value })}
                  />
                  <label>
                    Minutos desde el origen
                    <input
                      type="number"
                      onKeyDown={preventNonNumericKeys}
                      min={1}
                      max={Number(duration) - 1}
                      required
                      value={stop.minutes}
                      onChange={(event) => updateStop(index, { minutes: event.target.value })}
                    />
                  </label>
                  <button
                    className="cooperative-routes__button cooperative-routes__button--danger cooperative-routes__button--icon"
                    type="button"
                    onClick={() =>
                      setStops((current) => current.filter((_, itemIndex) => itemIndex !== index))
                    }
                    title="Quitar parada"
                    aria-label={`Quitar parada ${index + 1}`}
                  >
                    <span className="cooperative-routes__btn-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </span>
                    Quitar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Notificación flotante del modal */}
          {error && (
            <div className="cooperative-routes__toast-container" style={{ position: 'absolute', top: '1rem', right: '1rem', maxWidth: 'calc(100% - 2rem)' }}>
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
            </div>
          )}

          <div className="cooperative-routes__form-actions">
            <button
              className="cooperative-routes__button cooperative-routes__button--secondary cooperative-routes__button--icon"
              type="button"
              onClick={() =>
                setStops((current) => [
                  ...current,
                  { cityId: '', minutes: '', province: '', canton: '', search: '' },
                ])
              }
              disabled={!originCityId || !destinationCityId || stops.length >= 20}
            >
              <span className="cooperative-routes__btn-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              Añadir parada
            </button>
            <button type="button" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando ruta...' : 'Crear ruta y configurar tarifas →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
