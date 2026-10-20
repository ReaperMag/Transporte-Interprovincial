import { useState } from 'react';
import { BusSeatMap } from '../components/BusSeatMap';
import { BusTemplateSelector } from '../components/BusTemplateSelector';
import { busTemplates } from '../data/busTemplates.mock';
import type { TemplateSeat } from '../types/busTemplate.types';
import './SeatPurchasePage.css';

export function SeatPurchasePage() {
  const [selectedTemplateId, setSelectedTemplateId] = useState(busTemplates[0].id);
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [selectedSeatIds, setSelectedSeatIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const selectedTemplate =
    busTemplates.find((template) => template.id === selectedTemplateId) ?? busTemplates[0];
  const selectedSeats = selectedTemplate.seats.filter((seat) => selectedSeatIds.has(seat.id));

  function handleTemplateSelect(templateId: string) {
    setSelectedTemplateId(templateId);
    setSelectedFloor(1);
    setSelectedSeatIds(new Set<string>());
  }

  function handleToggleSeat(seat: TemplateSeat) {
    setSelectedSeatIds((currentSelection) => {
      const nextSelection = new Set(currentSelection);

      if (nextSelection.has(seat.id)) {
        nextSelection.delete(seat.id);
      } else {
        nextSelection.add(seat.id);
      }

      return nextSelection;
    });
  }

  return (
    <main className="seat-purchase-page">
      <div className="seat-purchase-page__content">
        <header className="seat-purchase-page__header">
          <p className="seat-purchase-page__eyebrow">Transporte interprovincial</p>
          <h1 className="seat-purchase-page__title">Elige tus asientos</h1>
          <p className="seat-purchase-page__description">
            Selecciona un diseño y marca los asientos que prefieras. Esta vista es una demostración
            y no procesa pagos.
          </p>
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
              {selectedSeats.length}{' '}
              {selectedSeats.length === 1 ? 'asiento seleccionado' : 'asientos seleccionados'}
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
            <button className="seat-purchase-page__continue" type="button" disabled>
              Continuar
            </button>
            <p className="seat-purchase-page__demo-note">
              La compra y el pago aún no están habilitados.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
