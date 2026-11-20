import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

import { CooperativeBusCreateWizard } from '../components/CooperativeBusCreateWizard';
import { CooperativeBusTemplatesManager } from '../components/CooperativeBusTemplatesManager';
import { VehicleBrandCombobox } from '../components/VehicleBrandCombobox';

import {
  cleanPlate,
  digitsError,
  onlyDigits,
  plateError,
  preventNonNumericKeys,
} from '../../../shared/utils/validation';

import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';

import {
  getCooperativeVehicleCatalog,
  type CooperativeVehicleCatalog,
} from '../services/cooperativeVehicleCatalog.service';

import {
  addCooperativeBusPhotos,
  createCooperativeBus,
  deleteCooperativeBus,
  deleteCooperativeBusPhoto,
  getCooperativeBuses,
  updateCooperativeBus,
  type BusInput,
  type CooperativeBusTemplateForBusResult,
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
  chassisBrandId: null,
  bodyworkBrandId: null,
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
  const [managingTemplates, setManagingTemplates] = useState(false);
  const [editingBusTemplate, setEditingBusTemplate] = useState(false);

  const [plateFilter, setPlateFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BusStatus | ''>('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Issue #63: catálogos globales.
  const [catalog, setCatalog] = useState<CooperativeVehicleCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Nombres históricos para los buses anteriores a la issue #63.
  const [historicalBrands, setHistoricalBrands] = useState({
    chassis: '',
    bodywork: '',
  });

  const unavailableChassis =
    !catalogLoading &&
    catalog !== null &&
    form.chassisBrandId != null &&
    !catalog.chassis.some((item) => item.id === form.chassisBrandId);

  const unavailableBodywork =
    !catalogLoading &&
    catalog !== null &&
    form.bodyworkBrandId != null &&
    !catalog.bodyworks.some((item) => item.id === form.bodyworkBrandId);

  const canSave =
    !saving && form.templateId !== null && !unavailableChassis && !unavailableBodywork;

  const showingEditor = creating || editingId !== null || managingTemplates;
  const editingBus = buses.find((bus) => bus.id === editingId);

  // ----------------------------------------------------
  // CARGA DE BUSES Y GRUPOS
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // ISSUE #63: CONSULTA DE CATÁLOGOS GLOBALES
  // ----------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    getCooperativeVehicleCatalog(controller.signal)
      .then(setCatalog)
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setCatalogError(
          loadError instanceof Error ? loadError.message : 'No fue posible cargar las marcas.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCatalogLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  // Actualizar solo la marca de chasis seleccionada.
  // El campo brand se mantiene para compatibilidad.
  const chooseChassis = (value: string) => {
    const selected = catalog?.chassis.find((item) => item.id === Number(value));

    if (!selected) {
      return;
    }

    setForm((current) => ({
      ...current,
      chassisBrandId: selected.id,
      brand: selected.name,
    }));
  };

  // Actualizar la marca de carrocería sin alterar el chasis.
  const chooseBodywork = (value: string) => {
    const selected = catalog?.bodyworks.find((item) => item.id === Number(value));

    if (!selected) {
      return;
    }

    setForm((current) => ({
      ...current,
      bodyworkBrandId: selected.id,
    }));
  };

  // ----------------------------------------------------
  // FORMULARIO DE EDICIÓN
  // ----------------------------------------------------

  const change = <K extends keyof BusForm>(field: K, value: BusForm[K]) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setForm(createInitialForm());
    setEditingId(null);
    setEditingBusTemplate(false);
    setEditingPhotos([]);

    setHistoricalBrands({
      chassis: '',
      bodywork: '',
    });

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

    const validationError = digitsError(form.number) ?? plateError(form.plate);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // La plantilla, los pisos y la capacidad se modifican únicamente
      // desde «Editar plantilla». No reenviarlos aquí evita revertir la copia.
      const input: Partial<BusInput> = {
        number: form.number,
        plate: form.plate,
        brand: form.brand,
        chassisBrandId: form.chassisBrandId,
        bodyworkBrandId: form.bodyworkBrandId,
        model: form.model,
        year: form.year,
        origin: form.origin,
        status: form.status,
        groupId: form.groupId,
      };

      if (editingId === null) {
        return;
      }

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

  // ----------------------------------------------------
  // CREACIÓN DE BUSES
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // SELECCIONAR BUS PARA EDITAR
  // ----------------------------------------------------

  const edit = (bus: CooperativeBus) => {
    setEditingId(bus.id);
    setEditingBusTemplate(false);
    setEditingPhotos(bus.photos ?? []);

    // Preservar nombres incluso cuando no existe referencia
    // a un elemento de los catálogos globales.
    setHistoricalBrands({
      chassis: bus.chassisBrand || bus.brand,
      bodywork: bus.bodyBrand,
    });

    setCreating(false);

    setForm({
      number: bus.number,
      plate: bus.plate,
      brand: bus.brand,

      // Referencias de los catálogos globales.
      chassisBrandId: bus.chassisBrandId,
      bodyworkBrandId: bus.bodyworkBrandId,

      model: bus.model,
      year: bus.year,
      capacity: bus.capacity,
      floors: bus.floors,
      origin: bus.origin,
      status: bus.status,
      groupId: bus.groupId,
      templateId: bus.templateId,
    });

    setError(null);
    setSuccess(null);
  };

  const onBusTemplateSaved = (result: CooperativeBusTemplateForBusResult) => {
    // El backend ya guardó y asignó la nueva plantilla atómicamente.
    setForm((current) => ({
      ...current,
      templateId: result.busTemplateId,
      capacity: result.capacity,
      floors: result.floors,
    }));
    void load();
  };

  // ----------------------------------------------------
  // ELIMINAR BUS
  // ----------------------------------------------------

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

  // ----------------------------------------------------
  // FOTOGRAFÍAS DEL BUS
  // ----------------------------------------------------

  const addPhotos = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';

    if (editingId === null || selected.length === 0) {
      return;
    }

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
      setError(
        photoError instanceof Error ? photoError.message : 'No fue posible subir las fotos.',
      );
    } finally {
      setSavingPhotos(false);
    }
  };

  const removePhoto = async (photo: CooperativeBusPhoto) => {
    if (editingId === null) {
      return;
    }

    setSavingPhotos(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteCooperativeBusPhoto(editingId, photo.id);

      setEditingPhotos((current) => current.filter((item) => item.id !== photo.id));

      setSuccess('La foto se eliminó del bus.');
      await load();
    } catch (photoError) {
      setError(
        photoError instanceof Error ? photoError.message : 'No fue posible eliminar la foto.',
      );
    } finally {
      setSavingPhotos(false);
    }
  };

  // ----------------------------------------------------
  // INTERFAZ
  // ----------------------------------------------------

  return (
    <section className="cooperative-buses">
      <header className="cooperative-buses__header" hidden={showingEditor}>
        <div>
          <p className="cooperative-buses__eyebrow">Administración de flota</p>

          <h2>Gestión de buses</h2>

          <p>Registra y controla los vehículos de tu cooperativa.</p>
        </div>

        {editingId === null && !creating && !managingTemplates && (
          <div className="cooperative-buses__header-actions">
            <button
              type="button"
              className="cooperative-buses__templates-action"
              onClick={() => {
                setError(null);
                setSuccess(null);
                setManagingTemplates(true);
              }}
            >
              Gestionar plantillas
            </button>
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
          </div>
        )}
      </header>

      {managingTemplates && (
        <CooperativeBusTemplatesManager onClose={() => setManagingTemplates(false)} />
      )}

      {editingBusTemplate && editingBus && (
        <CooperativeBusTemplatesManager
          key={editingBus.id}
          bus={editingBus}
          onBusSaved={onBusTemplateSaved}
          onClose={() => setEditingBusTemplate(false)}
        />
      )}

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
          hidden={showingEditor}
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className="cooperative-buses__message cooperative-buses__message--success"
          role="status"
          hidden={showingEditor}
        >
          {success}
        </p>
      )}

      {/* FORMULARIO DE EDICIÓN */}
      <form
        className="cooperative-buses__form"
        onSubmit={(event) => void submit(event)}
        hidden={editingId === null || creating || editingBusTemplate}
      >
        <div className="cooperative-buses__edit-heading">
          <h3>Editar bus</h3>
          <div className="cooperative-buses__header-actions">
            <div className="cooperative-buses__template-edit-control">
              <span
                className="cooperative-buses__template-edit-trigger"
                tabIndex={editingBus?.status === 'operativo' ? 0 : undefined}
                aria-describedby={
  editingBus?.status === 'operativo'
    ? 'cooperative-buses-template-tooltip'
    : undefined
}
              >
                <button
                  type="button"
                  disabled={!editingBus || editingBus.status === 'operativo'}
                  onClick={() => setEditingBusTemplate(true)}
                >
                  Editar plantilla
                </button>
                {editingBus?.status === 'operativo' && (
  <span
    id="cooperative-buses-template-tooltip"
    className="cooperative-buses__template-edit-tooltip"
    role="tooltip"
  >
    Primero cambia el estado a Mantenimiento o Fuera de servicio y guarda el bus.
  </span>
)}
              </span>
            </div>
            <button type="button" onClick={resetForm}>
              Volver a buses
            </button>
          </div>
        </div>

        <label>
          Número de disco
          <input
            required
            inputMode="numeric"
            maxLength={10}
            value={form.number}
            onChange={(event) => change('number', onlyDigits(event.target.value, 10))}
          />
        </label>

        <label>
          Placa
          <input
            required
            maxLength={10}
            placeholder="PBA-1234"
            value={form.plate}
            onChange={(event) => change('plate', cleanPlate(event.target.value))}
          />
        </label>

        {/* Issue #63: combobox compacto de chasis */}
        <div className="catalog-brand-field">
          <span>Marca de chasis</span>

          <VehicleBrandCombobox
            label="Marca de chasis"
            items={catalog?.chassis ?? []}
            value={form.chassisBrandId ?? null}
            historicalName={historicalBrands.chassis}
            placeholder={catalogLoading ? 'Cargando marcas...' : 'Selecciona una marca de chasis'}
            disabled={catalogLoading || catalogError !== null || !catalog?.chassis.length}
            onChange={(id) => chooseChassis(String(id))}
          />
        </div>

        {/* Issue #63: combobox compacto de carrocería */}
        <div className="catalog-brand-field">
          <span>Marca de carrocería</span>

          <VehicleBrandCombobox
            label="Marca de carrocería"
            items={catalog?.bodyworks ?? []}
            value={form.bodyworkBrandId ?? null}
            historicalName={historicalBrands.bodywork}
            placeholder={
              catalogLoading ? 'Cargando marcas...' : 'Selecciona una marca de carrocería'
            }
            disabled={catalogLoading || catalogError !== null || !catalog?.bodyworks.length}
            onChange={(id) => chooseBodywork(String(id))}
          />
        </div>

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
            onKeyDown={preventNonNumericKeys}
            value={form.year}
            onChange={(event) => change('year', Number(event.target.value))}
          />
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

        {catalogError && (
          <p className="cooperative-buses__message cooperative-buses__message--error" role="alert">
            {catalogError} Puedes editar los demás datos sin cambiar las marcas actuales.
          </p>
        )}

        {(unavailableChassis || unavailableBodywork) && (
          <p className="cooperative-buses__message cooperative-buses__message--error" role="alert">
            Una marca seleccionada ya no existe en el catálogo. Selecciona una marca vigente antes
            de guardar.
          </p>
        )}

        {/* FOTOGRAFÍAS EN EDICIÓN */}
        <section className="cooperative-buses__edit-photos" aria-labelledby="bus-photos-title">
          <div>
            <h4 id="bus-photos-title">Fotos del bus</h4>

            <p>Agrega o quita fotos JPG o PNG. Puedes guardar hasta 8 imágenes.</p>
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
              <p>Aún no hay fotos cargadas para este bus.</p>
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

      {/* FILTROS DEL LISTADO */}
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

      {/* TABLA DE BUSES */}
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
                <th>Chasis / modelo</th>
                <th>Carrocería</th>
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
                    {bus.chassisBrand} {bus.model}
                  </td>

                  <td>{bus.bodyBrand}</td>
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
