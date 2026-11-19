import { useEffect, useState, type FormEvent } from 'react';
import type { BusTemplate } from '../../buses/types/busTemplate.types';
import {
  getCooperativeBusTemplates,
  saveCooperativeBusTemplate,
  saveTemplateFromBus,
  type CooperativeBus,
  type CooperativeBusTemplate,
  type CooperativeBusTemplateForBusResult,
} from '../services/bus.service';
import { BusFloorplanEditor } from './BusFloorplanEditor';
import './CooperativeBusTemplatesManager.css';

interface CooperativeBusTemplatesManagerProps {
  onClose: () => void;
  /** Si se recibe un bus, su plantilla queda fijada y la copia se asigna a ese vehículo. */
  bus?: Pick<
    CooperativeBus,
    'id' | 'number' | 'templateId' | 'capacity' | 'status'
  >;
  onBusSaved?: (result: CooperativeBusTemplateForBusResult) => void;
}

// Convertir los ID persistidos a los identificadores de cadena usados
// internamente por el editor visual. La API no necesita esos ID al guardar.
function toEditorTemplate(template: CooperativeBusTemplate): BusTemplate {
  return {
    id: String(template.id),
    name: template.name,
    floors: template.floors,
    hasBathroom: template.hasBathroom,
    rows: template.rows,
    columns: template.columns,
    seats: template.seats.map((seat) => ({
      ...seat,
      id: String(seat.id),
    })),
  };
}

export function CooperativeBusTemplatesManager({
  onClose,
  bus,
  onBusSaved,
}: CooperativeBusTemplatesManagerProps) {
  const [templates, setTemplates] = useState<CooperativeBusTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<BusTemplate | null>(null);
  const [capacity, setCapacity] = useState(bus?.capacity ?? 200);
  const [generated, setGenerated] = useState(true);
  const [changed, setChanged] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const busTemplateId = bus?.templateId;

  useEffect(() => {
    let active = true;

    void getCooperativeBusTemplates()
      .then((items) => {
        if (!active) return;

        setTemplates(items);

        const first =
          busTemplateId === undefined
            ? items[0]
            : items.find((item) => item.id === busTemplateId);

        if (first) {
          setSelectedId(first.id);
          setDraft(toEditorTemplate(first));
        } else if (busTemplateId !== undefined) {
          setError('No se encontró la plantilla asignada a este bus.');
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible consultar las plantillas de asientos.',
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [busTemplateId]);

  const selected = templates.find((item) => item.id === selectedId);
  const capacityChanged = bus !== undefined && capacity !== bus.capacity;
  const pendingChanges = changed || capacityChanged;

  const confirmDiscard = () =>
    (!pendingChanges && generated) ||
    window.confirm('Tienes cambios sin guardar. ¿Deseas descartarlos?');

  const chooseTemplate = (id: number) => {
    if (id === selectedId || !confirmDiscard()) return;

    const template = templates.find((item) => item.id === id);
    if (!template) return;

    setSelectedId(template.id);
    setDraft(toEditorTemplate(template));
    setGenerated(true);
    setChanged(false);
    setError(null);
    setSuccess(null);
  };

  const changeFloors = (floors: number) => {
    if (!draft || floors === draft.floors) return;

    const secondFloorSeats = draft.seats.filter((seat) => seat.floor > floors);
    if (
      secondFloorSeats.length > 0 &&
      !window.confirm(
        `El segundo piso contiene ${secondFloorSeats.length} asientos. ¿Deseas eliminarlos del borrador?`,
      )
    ) {
      return;
    }

    const seats = draft.seats
      .filter((seat) => seat.floor <= floors)
      .sort((a, b) => a.floor - b.floor || a.row - b.row || a.column - b.column)
      .map((seat, index) => ({ ...seat, number: index + 1 }));

    setDraft({ ...draft, floors, seats });
    setChanged(true);
    setSuccess(null);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || selectedId === null || saving || !pendingChanges) return;

    if (bus?.status === 'operativo') {
      setError('Primero guarda el bus en mantenimiento o fuera de servicio.');
      return;
    }

    if (!generated) {
      setError(
        'Primero pulsa «Generar plantilla» para aplicar las nuevas dimensiones.',
      );
      return;
    }

    if (
      !draft.name.trim() ||
      draft.seats.length < 1 ||
      draft.seats.length > 200
    ) {
      setError('La plantilla necesita un nombre y entre 1 y 200 asientos.');
      return;
    }

    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 200 ||
      draft.seats.length > capacity
    ) {
      setError(
        'La capacidad debe estar entre 1 y 200 y cubrir todos los asientos del plano.',
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Separar el resultado del bus para mantener su tipo específico.
      const busResult = bus
        ? await saveTemplateFromBus(bus.id, draft, capacity)
        : null;
      const result =
        busResult ?? (await saveCooperativeBusTemplate(selectedId, draft));

      setTemplates((current) => {
        const next = result.copied
          ? [...current, result.template]
          : current.map((item) =>
              item.id === result.template.id ? result.template : item,
            );

        return next.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
      });

      setSelectedId(result.template.id);
      setDraft(toEditorTemplate(result.template));
      if (busResult) {
        onBusSaved?.(busResult);
      }

      setEditorRevision((current) => current + 1);
      setGenerated(true);
      setChanged(false);
      setSuccess(
        bus
          ? result.copied
            ? `Se creó la plantilla #${result.template.id} y se asignó al bus ${bus.number}. La plantilla original #${result.sourceTemplateId} se conserva para los demás buses.`
            : `Se actualizó la configuración del bus ${bus.number} sin generar una copia.`
          : result.copied
            ? `Se creó la plantilla #${result.template.id} como copia editable. Los buses siguen utilizando la plantilla original #${result.sourceTemplateId}.`
            : `Se guardaron los cambios de la plantilla #${result.template.id}.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No fue posible guardar la plantilla.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="cooperative-templates"
      aria-labelledby="cooperative-templates-title"
    >
      <header className="cooperative-templates__header">
        <div>
          <p className="cooperative-buses__eyebrow">Administración de flota</p>
          <h2 id="cooperative-templates-title">
            {bus
              ? `Editar plano del bus ${bus.number}`
              : 'Gestionar plantillas de asientos'}
          </h2>
          <p>
            {bus
              ? 'Edita el plano y la capacidad de este bus. Los demás buses conservarán el plano original.'
              : 'Selecciona una plantilla, modifica su distribución y guarda los cambios.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmDiscard()) onClose();
          }}
        >
          {bus ? 'Volver a editar bus' : 'Volver a buses'}
        </button>
      </header>

      {loading && <p role="status">Cargando plantillas...</p>}

      {error && (
        <p
          className="cooperative-buses__message cooperative-buses__message--error"
          role="alert"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className="cooperative-buses__message cooperative-buses__message--success"
          role="status"
        >
          {success}
        </p>
      )}

      {!loading && templates.length === 0 && !error && (
        <p role="status">
          Todavía no existen plantillas. Puedes crear una al registrar un nuevo
          bus.
        </p>
      )}

      {!loading && templates.length > 0 && draft && selected && (
        <form onSubmit={(event) => void save(event)}>
          <div className="cooperative-templates__controls">
            {bus ? (
              <div className="cooperative-templates__current-template">
                <span>Plantilla actual</span>
                <strong>
                  {selected.name} (#{selected.id})
                </strong>
              </div>
            ) : (
              <label>
                Plantilla existente
                <select
                  value={selectedId ?? ''}
                  disabled={saving}
                  onChange={(event) =>
                    chooseTemplate(Number(event.target.value))
                  }
                >
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (#{item.id})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {bus && (
              <label>
                Capacidad de pasajeros
                <input
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={capacity}
                  disabled={saving}
                  onChange={(event) => {
                    setCapacity(Number(event.target.value));
                    setSuccess(null);
                  }}
                />
              </label>
            )}

            <label>
              Número de pisos
              <select
                value={draft.floors}
                disabled={saving}
                onChange={(event) => changeFloors(Number(event.target.value))}
              >
                <option value={1}>1 piso</option>
                <option value={2}>2 pisos</option>
              </select>
            </label>

            <label className="cooperative-templates__checkbox">
              <input
                type="checkbox"
                checked={draft.hasBathroom}
                disabled={saving}
                onChange={(event) => {
                  setDraft({ ...draft, hasBathroom: event.target.checked });
                  setChanged(true);
                  setSuccess(null);
                }}
              />
              Incluir baño
            </label>
          </div>

          <div className="cooperative-templates__notice" role="status">
            {bus ? (
              <p>
                Solo puedes guardar cambios cuando el bus está en mantenimiento
                o fuera de servicio. Al modificar la distribución se creará una
                copia para este bus; los viajes finalizados conservarán su
                plantilla anterior. Si existen viajes pendientes o en curso,
                primero deberán finalizarse o reasignarse.
              </p>
            ) : selected.busCount > 0 ? (
              <p>
                Esta plantilla está asignada a {selected.busCount}{' '}
                {selected.busCount === 1 ? 'bus' : 'buses'}. Al guardar, se
                creará una copia independiente; los buses conservarán su
                plantilla original.
              </p>
            ) : (
              <p>
                Esta plantilla no está asignada a ningún bus. Se actualizará
                directamente salvo que deba conservarse como referencia de
                viajes anteriores; en ese caso se creará una copia.
              </p>
            )}
          </div>

          <p className="cooperative-templates__hint">
            {bus
              ? `El plano debe contener como máximo ${capacity} asientos para este bus.`
              : 'El plano admite hasta 200 asientos. Antes de asignarlo a un bus, verifica que no supere la capacidad de ese vehículo.'}
          </p>

          <fieldset className="cooperative-templates__editor" disabled={saving}>
            <BusFloorplanEditor
              key={`${selectedId}-${draft.floors}-${editorRevision}`}
              template={draft}
              onChange={(next) => {
                setDraft(next);
                setChanged(true);
                setSuccess(null);
              }}
              capacity={bus ? capacity : 200}
              generated={generated}
              onGenerated={() => {
                setGenerated(true);
                setChanged(true);
              }}
              onConfigurationChange={() => setGenerated(false)}
            />
          </fieldset>

          {!generated && (
            <p
              className="cooperative-buses__message cooperative-buses__message--error"
              role="alert"
            >
              Hay cambios de dimensiones sin aplicar. Pulsa «Generar plantilla»
              antes de guardar.
            </p>
          )}

          <div className="cooperative-templates__actions">
            <button
              type="submit"
              className="cooperative-buses__create"
              disabled={
                saving ||
                bus?.status === 'operativo' ||
                !pendingChanges ||
                !generated ||
                !draft.name.trim() ||
                draft.seats.length === 0 ||
                draft.seats.length > capacity ||
                capacity < 1 ||
                capacity > 200
              }
            >
              {saving
                ? 'Guardando plantilla...'
                : bus
                  ? changed
                    ? 'Guardar y asignar plano al bus'
                    : 'Guardar capacidad del bus'
                  : selected.busCount > 0
                    ? 'Guardar como copia'
                    : 'Guardar cambios'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (!confirmDiscard()) return;
                setDraft(toEditorTemplate(selected));
                if (bus) setCapacity(bus.capacity);
                setEditorRevision((current) => current + 1);
                setChanged(false);
                setGenerated(true);
                setError(null);
                setSuccess(null);
              }}
            >
              Descartar cambios
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
