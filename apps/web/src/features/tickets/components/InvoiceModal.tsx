import type { InvoiceData } from '../types/invoice.types';
import './InvoiceModal.css';

interface InvoiceModalProps {
  invoice: InvoiceData;
  isPaid: boolean;
  onCancel: () => void;
  onConfirmPayment: () => void;
}

export function InvoiceModal({ invoice, isPaid, onCancel, onConfirmPayment }: InvoiceModalProps) {
  const total = invoice.items.reduce((sum, item) => sum + item.price, 0);
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: invoice.currency,
    }).format(price);

  return (
    <div className="invoice-modal__backdrop">
      <section
        className="invoice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-modal-title"
      >
        <header className="invoice-modal__header">
          <div>
            <p className="invoice-modal__eyebrow">Comprobante de compra</p>
            <h2 id="invoice-modal-title">Factura</h2>
          </div>
          <button
            type="button"
            className="invoice-modal__close"
            onClick={onCancel}
            aria-label="Cerrar factura"
          >
            ×
          </button>
        </header>

        <div className="invoice-modal__body">
          <dl className="invoice-modal__metadata">
            <div>
              <dt>Número</dt>
              <dd>{invoice.number}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{new Date(invoice.issuedAt).toLocaleString('es-EC')}</dd>
            </div>
          </dl>

          <div className="invoice-modal__table-wrapper">
            <table className="invoice-modal__table">
              <thead>
                <tr>
                  <th>Pasajero</th>
                  <th>Asiento</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={`${item.seatNumber}-${index}`}>
                    <td>{item.passengerName}</td>
                    <td>{item.seatNumber}</td>
                    <td>{formatPrice(item.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={2}>Total</th>
                  <td>{formatPrice(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {isPaid && (
            <p className="invoice-modal__paid" role="status">
              Pago confirmado correctamente.
            </p>
          )}
          <p className="invoice-modal__note">
            Los precios mostrados son datos de ejemplo. El pago todavía no está conectado a una
            pasarela.
          </p>
        </div>

        <footer className="invoice-modal__actions">
          {isPaid ? (
            <>
              <button type="button" className="invoice-modal__cancel" onClick={onCancel}>
                Cerrar
              </button>
              <button type="button" className="invoice-modal__download" disabled>
                Descargar factura (PDF) · Próximamente
              </button>
            </>
          ) : (
            <>
              <button type="button" className="invoice-modal__cancel" onClick={onCancel}>
                Cancelar
              </button>
              <button type="button" className="invoice-modal__confirm" onClick={onConfirmPayment}>
                Confirmar pago
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
