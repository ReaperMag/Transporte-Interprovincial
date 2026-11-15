import { useEffect, useState } from 'react';
import type { BusTemplate, SeatType, TemplateSeat } from '../../buses/types/busTemplate.types';
import '../../buses/components/BusSeatMap.css';
import './BusFloorplanEditor.css';
import '../../buses/components/TransportTheme.css';
import { preventNonNumericKeys } from '../../../shared/utils/validation';
import { getCooperativeSeatTypes, type CooperativeSeatType } from '../services/seatType.service';

interface BusFloorplanEditorProps {
  template: BusTemplate;
  onChange: (template: BusTemplate) => void;
  capacity: number;
  generated?: boolean;
  onGenerated?: () => void;
  onConfigurationChange?: () => void;
  readOnly?: boolean;
}

function getSeatPositions(columns: number, seatsPerRow: number): number[] {
  const aisleColumn = Math.ceil(columns / 2);

  const aislePositions = Array.from({ length: columns }, (_, index) => index + 1).filter(
    (column) => column !== aisleColumn,
  );

  const positions =
    seatsPerRow < columns
      ? aislePositions
      : Array.from({ length: columns }, (_, index) => index + 1);

  const seatCount = Math.min(seatsPerRow, positions.length);

  return Array.from(
    { length: seatCount },
    (_, index) => positions[Math.floor((index * positions.length) / seatCount)],
  );
}

// Conserva los valores aceptados por el backend anterior.
function getLegacySeatType(name: string): SeatType {
  return name.trim().toLowerCase() === 'vip' ? 'vip' : 'normal';
}

// Issue #59: renumerar según la posición física, primero piso, luego fila y columna.
// El identificador y el tipo de cada asiento se mantienen intactos.
function renumberSeats(seats: TemplateSeat[]): TemplateSeat[] {
  return [...seats]
    .sort((a, b) => a.floor - b.floor || a.row - b.row || a.column - b.column)
    .map((seat, index) => ({ ...seat, number: index + 1 }));
}

export function BusFloorplanEditor({
  template,
  onChange,
  capacity,
  generated = true,
  onGenerated,
  onConfigurationChange,
  readOnly = false,
}: BusFloorplanEditorProps) {
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [generationInfo, setGenerationInfo] = useState<string | null>(null);

  // Tipo utilizado para agregar asientos.
  const [seatType, setSeatType] = useState<SeatType>('normal');
  const [seatTypeId, setSeatTypeId] = useState<number | null>(null);

  // Catálogo de tipos de asiento de la cooperativa.
  const [cooperativeSeatTypes, setCooperativeSeatTypes] = useState<CooperativeSeatType[]>([]);
  const [seatTypesLoading, setSeatTypesLoading] = useState(true);
  const [seatTypesError, setSeatTypesError] = useState<string | null>(null);

  const [layout, setLayout] = useState({
    rows: template.rows,
    columns: template.columns,
    seatsPerRow: Math.min(4, template.columns - 1),
  });

  const hasValidCapacity = Number.isInteger(capacity) && capacity >= 1 && capacity <= 200;
  const capacityExceeded = hasValidCapacity && template.seats.length > capacity;
  const capacityReached = hasValidCapacity && template.seats.length >= capacity;

  // Cargar los tipos registrados por la cooperativa.
  useEffect(() => {
    let active = true;

    void getCooperativeSeatTypes()
      .then((types) => {
        if (!active) return;

        setCooperativeSeatTypes(types);
        setSeatTypesError(null);

        // Seleccionar Normal si existe en el catálogo.
        const defaultType =
          types.find((type) => type.name.trim().toLowerCase() === 'normal') ?? types[0];

        if (defaultType) {
          setSeatTypeId(defaultType.id);
          setSeatType(getLegacySeatType(defaultType.name));
        } else {
          setSeatTypeId(null);
          setSeatType('normal');
        }
      })
      .catch((error: unknown) => {
        if (!active) return;

        setSeatTypesError(
          error instanceof Error ? error.message : 'No fue posible cargar los tipos de asiento.',
        );
      })
      .finally(() => {
        if (active) {
          setSeatTypesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const floorSeats = template.seats.filter((seat) => seat.floor === selectedFloor);
  const selectedSeat = template.seats.find((seat) => seat.id === selectedSeatId);
  const selectedFloorSeatCount = floorSeats.length;

  // Obtener el nombre real del tipo asignado a un asiento.
  const getSeatTypeName = (seat: TemplateSeat): string => {
    if (seat.seatTypeId != null) {
      const configuredType = cooperativeSeatTypes.find((type) => type.id === seat.seatTypeId);
      return configuredType?.name ?? `Tipo #${seat.seatTypeId}`;
    }

    return seat.seatType === 'vip' ? 'VIP' : 'Normal';
  };

  const updateTemplate = (changes: Partial<BusTemplate>, seats = template.seats) => {
    onChange({
      ...template,
      ...changes,
      seats,
    });
  };

  // El plano se crea únicamente al pulsar el botón Generar plantilla.
  const applyLayout = () => {
    if (!hasValidCapacity) {
      setCapacityError('Primero ingresa una capacidad de pasajeros entre 1 y 200.');
      return;
    }

    const positions = getSeatPositions(layout.columns, layout.seatsPerRow);
    const seatsPerFloor = layout.rows * positions.length;
    const totalSeats = Math.min(capacity, seatsPerFloor * template.floors);
    const seats: TemplateSeat[] = [];
    let number = 1;

    const defaultType =
      cooperativeSeatTypes.find((type) => type.name.trim().toLowerCase() === 'normal') ??
      cooperativeSeatTypes[0];

    // Repartir los asientos entre los pisos sin exceder la capacidad.
    for (let floor = 1; floor <= template.floors; floor += 1) {
      const floorQuota =
        Math.floor(totalSeats / template.floors) + (floor <= totalSeats % template.floors ? 1 : 0);
      let addedToFloor = 0;

      for (let row = 1; row <= layout.rows && addedToFloor < floorQuota; row += 1) {
        for (const column of positions) {
          if (addedToFloor >= floorQuota) break;
          seats.push({
            id: `seat-${floor}-${row}-${column}`,
            number,
            floor,
            row,
            column,
            seatType: defaultType ? getLegacySeatType(defaultType.name) : 'normal',
            seatTypeId: defaultType?.id ?? null,
          });
          number += 1;
          addedToFloor += 1;
        }
      }
    }

    updateTemplate({ rows: layout.rows, columns: layout.columns }, seats);
    const availablePositions = seatsPerFloor * template.floors;
    setGenerationInfo(
      availablePositions > capacity
        ? `Se generaron ${totalSeats} asientos, respetando la capacidad máxima de ${capacity}.`
        : `Se generaron ${totalSeats} asientos en el espacio configurado.`,
    );
    setSelectedFloor(1);
    setSelectedSeatId(null);
    setCapacityError(null);
    onGenerated?.();
  };

  const updateLayout = (changes: Partial<typeof layout>) => {
    setLayout((current) => ({ ...current, ...changes }));
    setCapacityError(null);
    onConfigurationChange?.();
    setSelectedSeatId(null);
  };

  // Cambiar el tipo utilizado al agregar asientos nuevos.
  const changeDefaultSeatType = (value: string) => {
    if (value === 'legacy:normal') {
      setSeatType('normal');
      setSeatTypeId(null);
      return;
    }

    if (value === 'legacy:vip') {
      setSeatType('vip');
      setSeatTypeId(null);
      return;
    }

    const selectedType = cooperativeSeatTypes.find((type) => `catalog:${type.id}` === value);
    if (!selectedType) return;

    setSeatTypeId(selectedType.id);
    setSeatType(getLegacySeatType(selectedType.name));
  };

  // Agregar un asiento en una posición vacía.
  const addSeat = (row: number, column: number) => {
    if (!hasValidCapacity) {
      setCapacityError('La capacidad del bus debe ser un número entero mayor que cero.');
      return;
    }

    if (template.seats.length >= capacity) {
      setCapacityError(
        `No puedes agregar más asientos. La capacidad máxima del bus es ${capacity} pasajeros.`,
      );
      return;
    }

    const number = template.seats.length + 1;

    const seat: TemplateSeat = {
      id: `seat-${selectedFloor}-${row}-${column}-${number}`,
      number,
      floor: selectedFloor,
      row,
      column,
      seatType,
      seatTypeId,
    };

    updateTemplate({}, renumberSeats([...template.seats, seat]));
    setCapacityError(null);
    setSelectedSeatId(seat.id);
  };

  const removeSelectedSeat = () => {
    updateTemplate({}, renumberSeats(template.seats.filter((seat) => seat.id !== selectedSeatId)));

    setCapacityError(null);
    setSelectedSeatId(null);
  };

  // Cambiar el tipo de un asiento ya existente.
  const changeSelectedSeatType = (value: string) => {
    if (!selectedSeatId) return;

    if (value === 'legacy:normal' || value === 'legacy:vip') {
      const legacyType: SeatType = value === 'legacy:vip' ? 'vip' : 'normal';

      updateTemplate(
        {},
        template.seats.map((seat) =>
          seat.id === selectedSeatId
            ? {
                ...seat,
                seatType: legacyType,
                seatTypeId: null,
              }
            : seat,
        ),
      );

      return;
    }

    const selectedType = cooperativeSeatTypes.find((type) => `catalog:${type.id}` === value);
    if (!selectedType) return;

    updateTemplate(
      {},
      template.seats.map((seat) =>
        seat.id === selectedSeatId
          ? {
              ...seat,
              seatType: getLegacySeatType(selectedType.name),
              seatTypeId: selectedType.id,
            }
          : seat,
      ),
    );
  };

  // Valor utilizado por el selector del asiento seleccionado.
  const selectedSeatTypeValue = selectedSeat
    ? selectedSeat.seatTypeId != null
      ? `catalog:${selectedSeat.seatTypeId}`
      : `legacy:${selectedSeat.seatType}`
    : '';

  const selectedCatalogTypeExists =
    selectedSeat?.seatTypeId != null &&
    cooperativeSeatTypes.some((type) => type.id === selectedSeat.seatTypeId);

  return (
    <div className="bus-floorplan-editor">
      {!readOnly && (
        <div className="bus-floorplan-editor__settings">
          <label>
            Nombre de la plantilla
            <input
              required
              disabled={!hasValidCapacity}
              maxLength={100}
              value={template.name}
              onChange={(event) => updateTemplate({ name: event.target.value })}
            />
          </label>
        </div>
      )}

      {!readOnly && (
        <section
          className="bus-floorplan-editor__layout-settings"
          aria-label="Distribución de asientos"
        >
          <label>
            Filas
            <input
              type="number"
              onKeyDown={preventNonNumericKeys}
              min={1}
              max={20}
              value={layout.rows}
              disabled={!hasValidCapacity}
              onChange={(event) =>
                updateLayout({
                  rows: Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                })
              }
            />
          </label>

          <label>
            Columnas disponibles
            <input
              type="number"
              onKeyDown={preventNonNumericKeys}
              min={2}
              max={8}
              value={layout.columns}
              disabled={!hasValidCapacity}
              onChange={(event) => {
                const columns = Math.max(2, Math.min(8, Number(event.target.value) || 2));
                updateLayout({
                  columns,
                  seatsPerRow: Math.min(layout.seatsPerRow, columns),
                });
              }}
            />
          </label>

          <label>
            Asientos por fila
            <input
              type="number"
              onKeyDown={preventNonNumericKeys}
              min={1}
              max={layout.columns}
              value={layout.seatsPerRow}
              disabled={!hasValidCapacity}
              onChange={(event) =>
                updateLayout({
                  seatsPerRow: Math.max(
                    1,
                    Math.min(layout.columns, Number(event.target.value) || 1),
                  ),
                })
              }
            />
          </label>

          <button
            type="button"
            onClick={applyLayout}
            disabled={!hasValidCapacity || seatTypesLoading}
          >
            Generar plantilla
          </button>
        </section>
      )}

      {!generated && capacityError && (
        <p className="bus-floorplan-editor__capacity-error" role="alert">
          {capacityError}
        </p>
      )}

      {!generated && !readOnly && (
        <p className="bus-floorplan-editor__hint" role="status">
          Configura los asientos y pulsa «Generar plantilla» para mostrar el plano editable.
          {template.seats.length > 0 &&
            ' Si vuelves a generar, se reemplazará la distribución anterior.'}
        </p>
      )}

      {(generated || readOnly) && (
        <>
          {generated && !readOnly && generationInfo && (
            <p className="bus-floorplan-editor__hint" role="status">
              {generationInfo}
            </p>
          )}
          {!readOnly && (
            <div className="bus-floorplan-editor__toolbar">
              <label>
                Tipo al agregar
                <select
                  value={seatTypeId === null ? `legacy:${seatType}` : `catalog:${seatTypeId}`}
                  disabled={seatTypesLoading}
                  onChange={(event) => changeDefaultSeatType(event.target.value)}
                >
                  {(cooperativeSeatTypes.length === 0 || seatTypeId === null) && (
                    <>
                      <option value="legacy:normal">Normal (compatibilidad)</option>
                      <option value="legacy:vip">VIP (compatibilidad)</option>
                    </>
                  )}

                  {cooperativeSeatTypes.map((type) => (
                    <option key={type.id} value={`catalog:${type.id}`}>
                      {type.name} — {Number(type.percentage).toFixed(2)} %
                    </option>
                  ))}
                </select>
              </label>

              {seatTypesLoading && <p role="status">Cargando tipos de asiento...</p>}

              {seatTypesError && <p role="alert">{seatTypesError}</p>}

              {!seatTypesLoading && !seatTypesError && cooperativeSeatTypes.length === 0 && (
                <p>
                  No hay tipos configurados. Puedes registrarlos en la sección Tipos de asiento.
                </p>
              )}

              {selectedSeat && (
                <div
                  className="bus-floorplan-editor__selection"
                  role="group"
                  aria-label="Editar asiento seleccionado"
                >
                  <span>Asiento {selectedSeat.number}</span>

                  <label>
                    Tipo
                    <select
                      value={selectedSeatTypeValue}
                      disabled={seatTypesLoading}
                      onChange={(event) => changeSelectedSeatType(event.target.value)}
                    >
                      {selectedSeat.seatTypeId == null && (
                        <option value={`legacy:${selectedSeat.seatType}`}>
                          {selectedSeat.seatType === 'vip'
                            ? 'VIP (compatibilidad)'
                            : 'Normal (compatibilidad)'}
                        </option>
                      )}

                      {selectedSeat.seatTypeId != null && !selectedCatalogTypeExists && (
                        <option value={`catalog:${selectedSeat.seatTypeId}`}>
                          Tipo #{selectedSeat.seatTypeId} no disponible
                        </option>
                      )}

                      {cooperativeSeatTypes.map((type) => (
                        <option key={type.id} value={`catalog:${type.id}`}>
                          {type.name} — {Number(type.percentage).toFixed(2)} %
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    className="bus-floorplan-editor__remove"
                    onClick={removeSelectedSeat}
                  >
                    Quitar asiento
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bus-floorplan-editor__summary" role="status">
            Piso {selectedFloor}: {selectedFloorSeatCount} asientos · Total: {template.seats.length}{' '}
            / {capacity} asientos
          </div>

          {!hasValidCapacity && (
            <p className="bus-floorplan-editor__capacity-error" role="alert">
              La capacidad de pasajeros debe ser un número entero mayor que cero.
            </p>
          )}

          {capacityExceeded && (
            <p className="bus-floorplan-editor__capacity-error" role="alert">
              Esta plantilla contiene {template.seats.length} asientos y supera la capacidad máxima
              de {capacity} pasajeros. Reduce los asientos o aumenta la capacidad del bus.
            </p>
          )}

          {!capacityExceeded && capacityReached && !readOnly && (
            <p role="status">
              Capacidad máxima alcanzada. Puedes quitar un asiento para agregarlo en otra posición.
            </p>
          )}

          {capacityError && (
            <p className="bus-floorplan-editor__capacity-error" role="alert">
              {capacityError}
            </p>
          )}

          <section className="bus-seat-map" aria-label={`Editor de asientos: ${template.name}`}>
            {template.floors > 1 && (
              <div
                className="bus-seat-map__floor-picker"
                role="group"
                aria-label="Seleccionar piso"
              >
                {Array.from({ length: template.floors }, (_, index) => index + 1).map((floor) => (
                  <button
                    className={`bus-seat-map__floor-button${
                      floor === selectedFloor ? ' bus-seat-map__floor-button--selected' : ''
                    }`}
                    key={floor}
                    type="button"
                    aria-pressed={floor === selectedFloor}
                    onClick={() => {
                      setSelectedFloor(floor);
                      setSelectedSeatId(null);
                    }}
                  >
                    Piso {floor}
                  </button>
                ))}
              </div>
            )}

            <div className="bus-seat-map__vehicle">
              <div className="bus-seat-map__front" aria-label="Frente del bus">
                <span className="bus-seat-map__front-label">Frente del bus</span>
                <span className="bus-seat-map__driver" aria-label="Conductor">
                  Conductor
                </span>
              </div>

              <div
                className="bus-seat-map__grid bus-floorplan-editor__grid"
                style={{
                  gridTemplateColumns: `repeat(${template.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${template.rows}, minmax(3.4rem, auto))`,
                }}
                role="group"
                aria-label={`Editar asientos del piso ${selectedFloor}`}
              >
                {Array.from(
                  {
                    length: template.rows * template.columns,
                  },
                  (_, index) => {
                    const row = Math.floor(index / template.columns) + 1;
                    const column = (index % template.columns) + 1;
                    const seat = floorSeats.find(
                      (item) => item.row === row && item.column === column,
                    );

                    if (seat) {
                      const seatLabel = getSeatTypeName(seat);
                      const isSpecialType = seatLabel.trim().toLowerCase() !== 'normal';

                      return (
                        <button
                          className={`bus-seat-map__seat bus-floorplan-editor__seat${
                            isSpecialType ? ' bus-seat-map__seat--vip' : ''
                          }${
                            seat.id === selectedSeatId
                              ? ' bus-floorplan-editor__seat--selected'
                              : ''
                          }`}
                          key={seat.id}
                          type="button"
                          style={{
                            gridColumn: column,
                            gridRow: row,
                          }}
                          title={`Asiento ${seat.number}: ${seatLabel}`}
                          aria-label={`Asiento ${seat.number}, fila ${row}, columna ${column}, tipo ${seatLabel}`}
                          aria-pressed={seat.id === selectedSeatId}
                          disabled={readOnly}
                          onClick={() => setSelectedSeatId(seat.id)}
                        >
                          <span className="bus-seat-map__seat-number">{seat.number}</span>

                          {isSpecialType && (
                            <span className="bus-seat-map__vip-label">{seatLabel}</span>
                          )}
                        </button>
                      );
                    }

                    return (
                      <button
                        className="bus-floorplan-editor__empty-seat"
                        key={`${row}-${column}`}
                        type="button"
                        style={{
                          gridColumn: column,
                          gridRow: row,
                        }}
                        aria-label={`Agregar asiento en fila ${row}, columna ${column}`}
                        disabled={
                          readOnly || seatTypesLoading || !hasValidCapacity || capacityReached
                        }
                        onClick={() => addSeat(row, column)}
                      >
                        +
                      </button>
                    );
                  },
                )}
              </div>

              {template.hasBathroom && (
                <div className="bus-seat-map__bathroom" aria-label="Baño">
                  Baño
                </div>
              )}

              <div className="bus-seat-map__rear">Parte posterior</div>
            </div>
          </section>

          <p className="bus-floorplan-editor__hint">
            Selecciona un espacio vacío para agregar un asiento. Elige un asiento para cambiar su
            tipo o quitarlo.
          </p>
        </>
      )}
    </div>
  );
}
