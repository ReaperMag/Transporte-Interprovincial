import { useState, type FormEvent } from 'react';
import type { BusTemplate } from '../../buses/types/busTemplate.types';
import type { BusOrigin, BusStatus, CooperativeBusCreateInput } from '../services/bus.service';
import type { CooperativeBusGroup } from '../services/busGroup.service';
import { BusFloorplanEditor } from './BusFloorplanEditor';
import './CooperativeBusCreateWizard.css';

interface CooperativeBusCreateWizardProps {
  groups: CooperativeBusGroup[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (input: CooperativeBusCreateInput) => Promise<void>;
}

type Metadata = Omit<CooperativeBusCreateInput, 'floors' | 'template'>;

const createInitialMetadata = (): Metadata => ({
  number: '',
  plate: '',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  capacity: 40,
  origin: 'nacional',
  status: 'operativo',
  groupId: 0,
});

const createInitialTemplate = (): BusTemplate => ({
  id: 'new-template',
  name: 'Plantilla personalizada',
  floors: 2,
  hasBathroom: true,
  rows: 8,
  columns: 5,
  seats: Array.from({ length: 64 }, (_, index) => {
    const floor = Math.floor(index / 32) + 1;
    const floorSeatIndex = index % 32;
    const row = Math.floor(floorSeatIndex / 4) + 1;
    const seatColumn = [1, 2, 4, 5][floorSeatIndex % 4];

    return {
      id: `seat-${floor}-${row}-${seatColumn}`,
      number: index + 1,
      floor,
      row,
      column: seatColumn,
      seatType: 'normal',
    };
  }),
});

const statusLabels: Record<BusStatus, string> = {
  operativo: 'Operativo',
  mantenimiento: 'Mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
};

export function CooperativeBusCreateWizard({
  groups,
  saving,
  error,
  onCancel,
  onCreate,
}: CooperativeBusCreateWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [metadata, setMetadata] = useState(createInitialMetadata);
  const [template, setTemplate] = useState(createInitialTemplate);

  const change = <K extends keyof Metadata>(field: K, value: Metadata[K]) => {
    setMetadata((current) => ({ ...current, [field]: value }));
  };

  const continueToFloorplan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStep(2);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCreate({
      ...metadata,
      floors: template.floors,
      template: {
        name: template.name.trim(),
        floors: template.floors,
        hasBathroom: template.hasBathroom,
        rows: template.rows,
        columns: template.columns,
        seats: template.seats.map(({ number, floor, row, column, seatType }) => ({
          number,
          floor,
          row,
          column,
          seatType,
        })),
      },
    });
  };

  return (
    <section className="bus-create-wizard" aria-labelledby="bus-create-title">
      <header className="bus-create-wizard__header">
        <div>
          <p className="cooperative-buses__eyebrow">Administración de flota</p>
          <h2 id="bus-create-title">Nuevo bus</h2>
          <p>Registra los datos del vehículo y configura su distribución de asientos.</p>
        </div>
        <button type="button" className="bus-create-wizard__cancel" onClick={onCancel}>
          Cancelar
        </button>
      </header>

      <ol className="bus-create-wizard__steps" aria-label="Pasos para registrar un bus">
        <li className={step === 1 ? 'bus-create-wizard__step--active' : ''}>
          <span>1</span> Datos del bus
        </li>
        <li className={step === 2 ? 'bus-create-wizard__step--active' : ''}>
          <span>2</span> Plano de asientos
        </li>
      </ol>

      {error && (
        <p className="cooperative-buses__message cooperative-buses__message--error" role="alert">
          {error}
        </p>
      )}

      {step === 1 ? (
        <form className="bus-create-wizard__metadata" onSubmit={continueToFloorplan}>
          <h3>Datos del bus</h3>
          <label>
            Número de disco
            <input
              required
              maxLength={10}
              value={metadata.number}
              onChange={(event) => change('number', event.target.value)}
            />
          </label>
          <label>
            Placa
            <input
              required
              maxLength={10}
              value={metadata.plate}
              onChange={(event) => change('plate', event.target.value)}
            />
          </label>
          <label>
            Marca
            <input
              required
              maxLength={50}
              value={metadata.brand}
              onChange={(event) => change('brand', event.target.value)}
            />
          </label>
          <label>
            Modelo
            <input
              required
              maxLength={50}
              value={metadata.model}
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
              value={metadata.year}
              onChange={(event) => change('year', Number(event.target.value))}
            />
          </label>
          <label>
            Capacidad de pasajeros
            <input
              required
              type="number"
              min={1}
              max={200}
              value={metadata.capacity}
              onChange={(event) => change('capacity', Number(event.target.value))}
            />
          </label>
          <label>
            Procedencia
            <select
              value={metadata.origin}
              onChange={(event) => change('origin', event.target.value as BusOrigin)}
            >
              <option value="nacional">Nacional</option>
              <option value="importado">Importado</option>
            </select>
          </label>
          <label>
            Estado
            <select
              value={metadata.status}
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
              value={metadata.groupId || ''}
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
          {groups.length === 0 && (
            <p className="bus-create-wizard__notice">
              Crea un grupo de buses antes de registrar un vehículo.
            </p>
          )}
          <div className="bus-create-wizard__actions">
            <button type="submit" disabled={groups.length === 0}>
              Continuar al plano
            </button>
          </div>
        </form>
      ) : (
        <form className="bus-create-wizard__floorplan" onSubmit={submit}>
          <h3>Diseño de asientos</h3>
          <p>
            Define la plantilla que se enviará con los datos del bus. Puedes ajustar la distribución
            y editar cada asiento directamente en la vista previa.
          </p>
          <BusFloorplanEditor template={template} onChange={setTemplate} />
          <div className="bus-create-wizard__actions">
            <button type="button" className="bus-create-wizard__back" onClick={() => setStep(1)}>
              Volver a datos
            </button>
            <button
              type="submit"
              disabled={saving || !template.name.trim() || !template.seats.length}
            >
              {saving ? 'Guardando...' : 'Crear bus'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
