import type { CSSProperties } from 'react';
import type { BusTemplate, TemplateSeat } from '../types/busTemplate.types';
import './BusSeatMap.css';

interface BusSeatMapProps {
  template: BusTemplate;
  selectedFloor: number;
  selectedSeatIds: ReadonlySet<string>;
  onFloorChange: (floor: number) => void;
  onToggleSeat: (seat: TemplateSeat) => void;
}

export function BusSeatMap({
  template,
  selectedFloor,
  selectedSeatIds,
  onFloorChange,
  onToggleSeat,
}: BusSeatMapProps) {
  const floorSeats = template.seats.filter((seat) => seat.floor === selectedFloor);
  const rowCount = Math.max(...floorSeats.map((seat) => seat.row));
  const gridStyle = {
    gridTemplateColumns: Array.from({ length: template.columns }, (_, index) =>
      index === Math.floor(template.columns / 2) ? '0.55fr' : '1fr',
    ).join(' '),
    gridTemplateRows: `repeat(${rowCount}, minmax(3.4rem, auto))`,
  } satisfies CSSProperties;

  return (
    <section className="bus-seat-map" aria-label={`Mapa de asientos: ${template.name}`}>
      {template.floors > 1 && (
        <div className="bus-seat-map__floor-picker" role="group" aria-label="Seleccionar piso">
          {Array.from({ length: template.floors }, (_, index) => index + 1).map((floor) => (
            <button
              className={`bus-seat-map__floor-button${
                floor === selectedFloor ? ' bus-seat-map__floor-button--selected' : ''
              }`}
              key={floor}
              type="button"
              aria-pressed={floor === selectedFloor}
              onClick={() => onFloorChange(floor)}
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
          className="bus-seat-map__grid"
          style={gridStyle}
          role="group"
          aria-label={`Asientos del piso ${selectedFloor}`}
        >
          {floorSeats.map((seat) => {
            const isSelected = selectedSeatIds.has(seat.id);
            const seatClasses = [
              'bus-seat-map__seat',
              seat.seatType === 'vip' ? 'bus-seat-map__seat--vip' : '',
              isSelected ? 'bus-seat-map__seat--selected' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                className={seatClasses}
                key={seat.id}
                type="button"
                style={{
                  gridColumn: seat.column,
                  gridRow: seat.row,
                }}
                aria-label={`Asiento ${seat.number}, ${seat.seatType === 'vip' ? 'VIP' : 'normal'}${
                  isSelected ? ', seleccionado' : ''
                }`}
                aria-pressed={isSelected}
                onClick={() => onToggleSeat(seat)}
              >
                <span className="bus-seat-map__seat-number">{seat.number}</span>
                {seat.seatType === 'vip' && <span className="bus-seat-map__vip-label">VIP</span>}
              </button>
            );
          })}
        </div>

        {template.hasBathroom && (
          <div className="bus-seat-map__bathroom" aria-label="Baño">
            Baño
          </div>
        )}
        <div className="bus-seat-map__rear">Parte posterior</div>
      </div>
    </section>
  );
}
