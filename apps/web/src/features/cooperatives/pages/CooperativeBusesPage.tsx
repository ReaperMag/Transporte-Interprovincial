import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { CooperativeBusCreateWizard } from '../components/CooperativeBusCreateWizard';
import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';
import {
  addCooperativeBusPhotos,
  createCooperativeBus,
  deleteCooperativeBus,
  deleteCooperativeBusPhoto,
  getCooperativeBuses,
  updateCooperativeBus,
  type BusInput,
  type CooperativeBusCreateInput,
  type CooperativeBusPhoto,
  type CooperativeBus,
  type BusOrigin,
  type BusStatus,
} from '../services/bus.service';
import './CooperativeBusesPage.css';

type BusForm = Omit<BusInput, 'templateId'> & {
  templateId: number | null;
};

const createInitialForm = (): BusForm => ({
  number: '',
  plate: '',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  capacity: 40,
  floors: 2,
  origin: 'nacional',
  status: 'operativo',
  groupId: 0,
  templateId: null,
});

const statusLabels: Record<BusStatus, string> = {
  operativo: 'Operativo',
  mantenimiento: 'Mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
};

export function CooperativeBusesPage() {
  const [buses, setBuses] = useState<CooperativeBus[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [form, setForm] = useState<BusForm>(createInitialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingPhotos, setEditingPhotos] = useState<CooperativeBusPhoto[]>([]);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [creating, setCreating] = useState(false);

  const [plateFilter, setPlateFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BusStatus | ''>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSave = !saving && form.templateId !== null;
  const showingEditor = creating || editingId !== null;

  const load = useCallback(async () => {
    try {
      const [busResult, groupResult] = await Promise.all([
        getCooperativeBuses({
          plate: plateFilter.trim() || undefined,
          groupId: groupFilter ? Number(groupFilter) : undefined,
          status: statusFilter || undefined,
        }),
        getCooperativeBusGroups(),
      ]);

      setBuses(busResult);
      setGroups(groupResult);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar los buses.');
    } finally {
      setLoading(false);
    }
  }, [groupFilter, plateFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const change = <K extends keyof BusForm>(field: K, value: BusForm[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(createInitialForm());
    setEditingId(null);
    setEditingPhotos([]);
    setCreating(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (form.templateId === null) {
      setError('Este bus no tiene una plantilla de asientos asignada.');
      return;
    }

    if (!form.groupId) {
      setError('Selecciona un grupo de buses.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const input: BusInput = {
        ...form,
        templateId: form.templateId,
      };

      if (editingId === null) return;
      await updateCooperativeBus(editingId, input);

      setSuccess('Los cambios del bus se guardaron.');
      resetForm();
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar el bus.');
    } finally {
      setSaving(false);
    }
  };

  const create = async (input: CooperativeBusCreateInput, photos: File[]) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await createCooperativeBus(input, photos);
      setCreating(false);
      setSuccess('El bus se registró correctamente.');
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'No fue posible crear el bus.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (bus: CooperativeBus) => {
    setEditingId(bus.id);
    setEditingPhotos(bus.photos ?? []);
    setCreating(false);

    setForm({
      number: bus.number,
      plate: bus.plate,
      brand: bus.brand,
      model: bus.model,
      year: bus.year,
      capacity: bus.capacity,
      floors: 2,
      origin: bus.origin,
      status: bus.status,
      groupId: bus.groupId,
      templateId: bus.templateId,
    });

    setError(null);
    setSuccess(null);
  };

  const remove = async (bus: CooperativeBus) => {
    if (!window.confirm(`¿Eliminar el bus ${bus.plate}? Esta acción no se puede deshacer.`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      await deleteCooperativeBus(bus.id);
      setSuccess(`El bus ${bus.plate} se eliminó.`);
      await load();
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : 'No fue posible eliminar el bus.',
      );
    }
  };

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (editingId === null || selected.length === 0) return;
    if (selected.some((file) => !['image/jpeg', 'image/png'].includes(file.type))) {
      setError('Solo puedes subir fotos JPG o PNG.');
      return;
    }
    if (editingPhotos.length + selected.length > 8) {
      setError('El bus puede tener hasta 8 fotos.');
      return;
    }

    setSavingPhotos(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await addCooperativeBusPhotos(editingId, selected);
      setEditingPhotos((current) => [...current, ...created]);
      setSuccess('Las fotos del bus se actualizaron.');
      await load();
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'No fue posible subir las fotos.');
    } finally {
      setSavingPhotos(false);
    }
  };

  const removePhoto = async (photo: CooperativeBusPhoto) => {
    if (editingId === null) return;
    setSavingPhotos(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteCooperativeBusPhoto(editingId, photo.id);
      setEditingPhotos((current) => current.filter((item) => item.id !== photo.id));
      setSuccess('La foto se elimin? del bus.');
      await load();
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : 'No fue posible eliminar la foto.');
    } finally {
      setSavingPhotos(false);
    }
  };

  return (
    <section className="cooperative-buses">
      <header className="cooperative-buses__header" hidden={showingEditor}>
        <div>
          <p className="cooperative-buses__eyebrow">Administración de flota</p>
          <h2>Gestión de buses</h2>
          <p>Registra y controla los vehículos de tu cooperativa.</p>
        </div>
        {editingId === null && (
          <button
            type="button"
            className="cooperative-buses__create"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setCreating(true);
            }}
          >
            Nuevo bus
          </button>
        )}
      </header>

      {creating && (
        <CooperativeBusCreateWizard
          groups={groups}
          saving={saving}
          error={error}
          onCancel={() => {
            setCreating(false);
            setError(null);
          }}
          onCreate={create}
        />
      )}

      {error && (
        <p
          className="cooperative-buses__message cooperative-buses__message--error"
          role="alert"
          hidden={creating}
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className="cooperative-buses__message cooperative-buses__message--success"
          role="status"
          hidden={creating}
        >
          {success}
        </p>
      )}

      <form
        className="cooperative-buses__form"
        onSubmit={(event) => void submit(event)}
        hidden={editingId === null || creating}
      >
        <h3>Editar bus</h3>

        <label>
          Número de disco
          <input
            required
            maxLength={10}
            value={form.number}
            onChange={(event) => change('number', event.target.value)}
          />
        </label>

        <label>
          Placa
          <input
            required
            maxLength={10}
            value={form.plate}
            onChange={(event) => change('plate', event.target.value)}
          />
        </label>

        <label>
          Marca
          <input
            required
            maxLength={50}
            value={form.brand}
            onChange={(event) => change('brand', event.target.value)}
          />
        </label>

        <label>
          Modelo
          <input
            required
            maxLength={50}
            value={form.model}
            onChange={(event) => change('model', event.target.value)}
          />
        </label>

        <label>
          Año
          <input
            required
            type="number"
            min={1950}
            max={new Date().getFullYear() + 1}
            value={form.year}
            onChange={(event) => change('year', Number(event.target.value))}
          />
        </label>

        <label>
          Capacidad
          <input
            required
            type="number"
            min={1}
            max={200}
            value={form.capacity}
            onChange={(event) => change('capacity', Number(event.target.value))}
          />
        </label>

        <label>
          Pisos
          <input value="2" readOnly />
        </label>

        <label>
          Procedencia
          <select
            value={form.origin}
            onChange={(event) => change('origin', event.target.value as BusOrigin)}
          >
            <option value="nacional">Nacional</option>
            <option value="importado">Importado</option>
          </select>
        </label>

        <label>
          Estado
          <select
            value={form.status}
            onChange={(event) => change('status', event.target.value as BusStatus)}
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Grupo
          <select
            required
            value={form.groupId || ''}
            onChange={(event) => change('groupId', Number(event.target.value))}
          >
            <option value="" disabled>
              Selecciona un grupo
            </option>

            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Plantilla de asientos
          <input
            readOnly
            value={
              form.templateId === null
                ? 'Pendiente de integración'
                : `Plantilla #${form.templateId}`
            }
            aria-describedby="bus-template-help"
          />
        </label>

        <p id="bus-template-help" role="status">
          Este bus conserva su plantilla asignada.
        </p>

        <section className="cooperative-buses__edit-photos" aria-labelledby="bus-photos-title">
          <div>
            <h4 id="bus-photos-title">Fotos del bus</h4>
            <p>Agrega o quita fotos JPG o PNG. Puedes guardar hasta 8 im?genes.</p>
          </div>
          <label className="cooperative-buses__photo-upload">
            {savingPhotos ? 'Procesando fotos...' : 'Subir fotos'}
            <input
              type="file"
              accept="image/jpeg,image/png"
              multiple
              disabled={savingPhotos || editingPhotos.length >= 8}
              onChange={(event) => void addPhotos(event)}
            />
          </label>
          <div className="cooperative-buses__photo-grid" aria-live="polite">
            {editingPhotos.length ? (
              editingPhotos.map((photo) => (
                <figure key={photo.id} className="cooperative-buses__photo">
                  <img src={photo.url} alt={`Foto ${photo.id} del bus`} />
                  <button
                    type="button"
                    disabled={savingPhotos}
                    onClick={() => void removePhoto(photo)}
                    aria-label={`Eliminar foto ${photo.id}`}
                  >
                    Eliminar foto
                  </button>
                </figure>
              ))
            ) : (
              <p>A?n no hay fotos cargadas para este bus.</p>
            )}
          </div>
        </section>

        <button type="submit" disabled={!canSave}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>

        <button type="button" onClick={resetForm}>
          Cancelar
        </button>
      </form>

      <div className="cooperative-buses__filters" hidden={showingEditor}>
        <label>
          Buscar por placa
          <input value={plateFilter} onChange={(event) => setPlateFilter(event.target.value)} />
        </label>

        <label>
          Grupo
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="">Todos</option>

            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Estado
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as BusStatus | '')}
          >
            <option value="">Todos</option>

            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <p role="status" hidden={showingEditor}>
          Cargando buses...
        </p>
      ) : buses.length === 0 ? (
        <p hidden={showingEditor}>No hay buses que coincidan con los filtros.</p>
      ) : (
        <div className="cooperative-buses__table-wrap" hidden={showingEditor}>
          <table>
            <thead>
              <tr>
                <th>Número de disco</th>
                <th>Placa</th>
                <th>Marca / modelo</th>
                <th>Capacidad</th>
                <th>Procedencia</th>
                <th>Grupo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {buses.map((bus) => (
                <tr key={bus.id}>
                  <td>{bus.number}</td>
                  <td>{bus.plate}</td>
                  <td>
                    {bus.brand} {bus.model}
                  </td>
                  <td>{bus.capacity}</td>
                  <td>{bus.origin}</td>
                  <td>{bus.groupName}</td>

                  <td>{statusLabels[bus.status]}</td>

                  <td>
                    <button type="button" onClick={() => edit(bus)}>
                      Editar
                    </button>

                    <button type="button" onClick={() => void remove(bus)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
