import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getCooperativeBusGroups, type CooperativeBusGroup } from '../services/busGroup.service';
import {
  createCooperativeBus,
  deleteCooperativeBus,
  getCooperativeBuses,
  updateCooperativeBus,
  updateCooperativeBusStatus,
  type BusInput,
  type CooperativeBus,
  type BusOrigin,
  type BusStatus,
} from '../services/bus.service';
import './CooperativeBusesPage.css';

const initialForm: BusInput = {
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
};

const statusLabels: Record<BusStatus, string> = {
  operativo: 'Operativo',
  mantenimiento: 'Mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
};

export function CooperativeBusesPage() {
  const [buses, setBuses] = useState<CooperativeBus[]>([]);
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [form, setForm] = useState<BusInput>(initialForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [plateFilter, setPlateFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BusStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const change = <K extends keyof BusInput>(field: K, value: BusInput[K]) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (!form.groupId) throw new Error('Selecciona un grupo de buses.');
      if (editingId === null) {
        await createCooperativeBus(form);
        setSuccess('El bus se registró correctamente.');
      } else {
        await updateCooperativeBus(editingId, form);
        setSuccess('Los cambios del bus se guardaron.');
      }
      setForm(initialForm);
      setEditingId(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No fue posible guardar el bus.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (bus: CooperativeBus) => {
    setEditingId(bus.id);
    setForm({ number: bus.number, plate: bus.plate, brand: bus.brand, model: bus.model, year: bus.year, capacity: bus.capacity, floors: 2, origin: bus.origin, status: bus.status, groupId: bus.groupId });
    setError(null);
  };

  const remove = async (bus: CooperativeBus) => {
    if (!window.confirm(`¿Eliminar el bus ${bus.plate}? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteCooperativeBus(bus.id);
      setSuccess(`El bus ${bus.plate} se eliminó.`);
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'No fue posible eliminar el bus.');
    }
  };

  return (
    <section className="cooperative-buses">
      <header><p className="cooperative-buses__eyebrow">Administración de flota</p><h2>Gestión de buses</h2><p>Registra y controla los vehículos de tu cooperativa.</p></header>
      {error && <p className="cooperative-buses__message cooperative-buses__message--error" role="alert">{error}</p>}
      {success && <p className="cooperative-buses__message cooperative-buses__message--success" role="status">{success}</p>}
      <form className="cooperative-buses__form" onSubmit={(event) => void submit(event)}>
        <h3>{editingId === null ? 'Registrar bus' : 'Editar bus'}</h3>
        <label>Número de disco<input required maxLength={10} value={form.number} onChange={(event) => change('number', event.target.value)} /></label>
        <label>Placa<input required maxLength={10} value={form.plate} onChange={(event) => change('plate', event.target.value)} /></label>
        <label>Marca<input required maxLength={50} value={form.brand} onChange={(event) => change('brand', event.target.value)} /></label>
        <label>Modelo<input required maxLength={50} value={form.model} onChange={(event) => change('model', event.target.value)} /></label>
        <label>Año<input required type="number" min={1950} max={new Date().getFullYear() + 1} value={form.year} onChange={(event) => change('year', Number(event.target.value))} /></label>
        <label>Capacidad<input required type="number" min={1} max={200} value={form.capacity} onChange={(event) => change('capacity', Number(event.target.value))} /></label>
        <label>Pisos<input value="2" readOnly /></label>
        <label>Procedencia<select value={form.origin} onChange={(event) => change('origin', event.target.value as BusOrigin)}><option value="nacional">Nacional</option><option value="importado">Importado</option></select></label>
        <label>Estado<select value={form.status} onChange={(event) => change('status', event.target.value as BusStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Grupo<select required value={form.groupId || ''} onChange={(event) => change('groupId', Number(event.target.value))}><option value="" disabled>Selecciona un grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : editingId === null ? 'Registrar bus' : 'Guardar cambios'}</button>
        {editingId !== null && <button type="button" onClick={() => { setEditingId(null); setForm(initialForm); }}>Cancelar</button>}
      </form>
      <div className="cooperative-buses__filters"><label>Buscar por placa<input value={plateFilter} onChange={(event) => setPlateFilter(event.target.value)} /></label><label>Grupo<select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="">Todos</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BusStatus | '')}><option value="">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {loading ? <p role="status">Cargando buses...</p> : buses.length === 0 ? <p>No hay buses que coincidan con los filtros.</p> : <div className="cooperative-buses__table-wrap"><table><thead><tr><th>Número de disco</th><th>Placa</th><th>Marca / modelo</th><th>Capacidad</th><th>Procedencia</th><th>Grupo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{buses.map((bus) => <tr key={bus.id}><td>{bus.number}</td><td>{bus.plate}</td><td>{bus.brand} {bus.model}</td><td>{bus.capacity}</td><td>{bus.origin}</td><td>{bus.groupName}</td><td><select aria-label={`Estado de ${bus.plate}`} value={bus.status} onChange={(event) => void updateCooperativeBusStatus(bus.id, event.target.value as BusStatus).then(load).catch((updateError) => setError(updateError instanceof Error ? updateError.message : 'No fue posible cambiar el estado.'))}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td><button type="button" onClick={() => edit(bus)}>Editar</button><button type="button" onClick={() => void remove(bus)}>Eliminar</button></td></tr>)}</tbody></table></div>}
    </section>
  );
}
