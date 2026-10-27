import { useState } from 'react';
import { BusSeatMap } from './BusSeatMap';
import { BusTemplateSelector } from './BusTemplateSelector';
import { busTemplates } from '../data/busTemplates.mock';
import type { TemplateSeat } from '../types/busTemplate.types';
import './SeatSelectionForm.css';

interface SeatSelectionFormProps {
  title?: string;
  description?: string;
  requiredSeatCount?: number;
  continueLabel?: string;
  note?: string;
  embedded?: boolean;
  onContinue?: (seats: TemplateSeat[]) => void;
  onSelectionChange?: () => void;
}

export function SeatSelectionForm({
  title = 'Elige tus asientos',
  description = 'Selecciona un diseño y marca los asientos que prefieras. Esta vista es una demostración y no procesa pagos.',
  requiredSeatCount,
  continueLabel = 'Continuar',
  note = 'La compra y el pago aún no están habilitados.',
  embedded = false,
  onContinue,
  onSelectionChange,
}: SeatSelectionFormProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(busTemplates[0].id);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [selectedSeatIds, setSelectedSeatIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const selectedTemplate =
    busTemplates.find((template) => template.id === selectedTemplateId) ?? busTemplates[0];
  const selectedSeats = selectedTemplate.seats.filter((seat) => selectedSeatIds.has(seat.id));
  const hasRequiredSeatCount =
    requiredSeatCount === undefined || selectedSeats.length === requiredSeatCount;

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    setSelectedFloor(1);
    setSelectedSeatIds(new Set<string>());
    onSelectionChange?.();
  }

  function handleToggleSeat(seat: TemplateSeat) {
    const nextSelection = new Set(selectedSeatIds);
    if (nextSelection.has(seat.id)) {
      nextSelection.delete(seat.id);
    } else if (requiredSeatCount === undefined || nextSelection.size < requiredSeatCount) {
      nextSelection.add(seat.id);
    } else {
      return;
    }

    setSelectedSeatIds(nextSelection);
    onSelectionChange?.();
  }

  return (
    <section
      className={`seat-purchase-page${embedded ? ' seat-purchase-page--embedded' : ''}`}
      aria-label="Formulario de selección de asientos"
    >
      <div className="seat-purchase-page__content">
        <header className="seat-purchase-page__header">
          <p className="seat-purchase-page__eyebrow">Transporte interprovincial</p>
          <h1 className="seat-purchase-page__title">{title}</h1>
          <p className="seat-purchase-page__description">{description}</p>
        </header>

        <section className="seat-purchase-page__section" aria-labelledby="template-heading">
          <div className="seat-purchase-page__section-heading">
            <div>
              <h2 id="template-heading">Diseño del bus</h2>
              <p>Prueba las distintas distribuciones de asientos.</p>
            </div>
          </div>
          <BusTemplateSelector
            templates={busTemplates}
            selectedTemplateId={selectedTemplate.id}
            onSelect={handleTemplateSelect}
          />
        </section>

        <div className="seat-purchase-page__workspace">
          <section className="seat-purchase-page__map-card" aria-labelledby="seat-map-heading">
            <div className="seat-purchase-page__section-heading">
              <div>
                <h2 id="seat-map-heading">{selectedTemplate.name}</h2>
                <p>
                  {selectedTemplate.seats.length} asientos · {selectedTemplate.floors}{' '}
                  {selectedTemplate.floors === 1 ? 'piso' : 'pisos'}
                </p>
              </div>
            </div>
            <BusSeatMap
              template={selectedTemplate}
              selectedFloor={selectedFloor}
              selectedSeatIds={selectedSeatIds}
              onFloorChange={setSelectedFloor}
              onToggleSeat={handleToggleSeat}
            />
            <ul className="seat-purchase-page__legend" aria-label="Leyenda del mapa">
              <li>
                <span
                  className="seat-purchase-page__legend-swatch seat-purchase-page__legend-swatch--normal"
                  aria-hidden="true"
                />
                Asiento normal
              </li>
              <li>
                <span
                  className="seat-purchase-page__legend-swatch seat-purchase-page__legend-swatch--vip"
                  aria-hidden="true"
                >
                  VIP
                </span>
                Asiento VIP
              </li>
              <li>
                <span className="seat-purchase-page__legend-aisle" aria-hidden="true" />
                Pasillo
              </li>
              {selectedTemplate.hasBathroom && (
                <li>
                  <span className="seat-purchase-page__legend-bathroom" aria-hidden="true">
                    Baño
                  </span>
                  Baño
                </li>
              )}
            </ul>
          </section>

          <aside className="seat-purchase-page__summary" aria-labelledby="summary-heading">
            <h2 id="summary-heading">Tu selección</h2>
            <p className="seat-purchase-page__summary-count" aria-live="polite">
              {requiredSeatCount === undefined
                ? `${selectedSeats.length} ${
                    selectedSeats.length === 1 ? 'asiento seleccionado' : 'asientos seleccionados'
                  }`
                : `${selectedSeats.length} de ${requiredSeatCount} asientos seleccionados`}
            </p>
            {selectedSeats.length > 0 ? (
              <ul className="seat-purchase-page__selected-list">
                {selectedSeats.map((seat) => (
                  <li className="seat-purchase-page__selected-seat" key={seat.id}>
                    <span>Asiento {seat.number}</span>
                    <span className="seat-purchase-page__selected-detail">
                      Piso {seat.floor} · {seat.seatType === 'vip' ? 'VIP' : 'Normal'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="seat-purchase-page__empty">
                Aún no has seleccionado asientos. Pulsa uno en el mapa para agregarlo.
              </p>
            )}
            <button
              className="seat-purchase-page__continue"
              type="button"
              disabled={!onContinue || selectedSeats.length === 0 || !hasRequiredSeatCount}
              onClick={() => onContinue?.(selectedSeats)}
            >
              {continueLabel}
            </button>
            <p className="seat-purchase-page__demo-note">{note}</p>
          </aside>
        </div>
      </div>
    </section>
  );
}
