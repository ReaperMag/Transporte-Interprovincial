import { useCallback, useEffect, useState } from 'react';
import {
  approveOfficePayment,
  getPendingOfficePayments,
  rejectOfficePayment,
  type PaymentRead,
} from '../../passengers/services/payment.service';
import './OficinistaOperationsPage.css';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  }).format(new Date(value));
}

export function OficinistaPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [reason, setReason] = useState<'payment_not_received' | 'receipt_unverifiable'>(
    'receipt_unverifiable',
  );
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayments(await getPendingOfficePayments());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudieron cargar las solicitudes de pago.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getPendingOfficePayments()
      .then((result) => {
        if (active) setPayments(result);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudieron cargar las solicitudes de pago.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleApprove = async (paymentId: number) => {
    setProcessingId(paymentId);
    setError(null);
    setNotice(null);
    try {
      await approveOfficePayment(paymentId);
      setPayments((current) => current.filter((payment) => payment.id !== paymentId));
      setNotice(`Comprobante #${paymentId} aprobado. La compra quedó confirmada.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo aprobar el comprobante.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (paymentId: number) => {
    setProcessingId(paymentId);
    setError(null);
    setNotice(null);
    try {
      await rejectOfficePayment(paymentId, reason, comment);
      setPayments((current) => current.filter((payment) => payment.id !== paymentId));
      setRejectingId(null);
      setComment('');
      setNotice(`Comprobante #${paymentId} rechazado.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo rechazar el comprobante.',
      );
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <section className="oficinista-operations" aria-labelledby="office-payments-title">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">Revisión de pagos</p>
        <h1 id="office-payments-title">Comprobantes pendientes</h1>
        <p>Revisa las solicitudes de compra pagadas mediante transferencia o depósito.</p>
      </header>

      {error && (
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="oficinista-operations__notice" role="status">
          {notice}
        </p>
      )}

      <section className="oficinista-operations__card">
        <div className="oficinista-operations__card-heading">
          <div>
            <h2>Solicitudes por revisar</h2>
            {!loading && (
              <p>
                {payments.length} comprobante{payments.length === 1 ? '' : 's'} pendiente
                {payments.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <button
            type="button"
            className="oficinista-operations__button--secondary"
            onClick={() => void loadPayments()}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>

        {loading ? (
          <p role="status">Cargando solicitudes...</p>
        ) : payments.length === 0 ? (
          <p className="oficinista-operations__empty">
            No hay comprobantes pendientes de revisión.
          </p>
        ) : (
          <div className="oficinista-operations__list">
            {payments.map((payment) => (
              <article className="oficinista-operations__item" key={payment.id}>
                <div className="oficinista-operations__item-heading">
                  <div>
                    <h3>
                      Pago #{payment.id} · Reserva #{payment.reservationId}
                    </h3>
                    <p>
                      Viaje #{payment.tripId} · {formatDate(payment.createdAt)}
                    </p>
                  </div>
                  <strong>{formatMoney(payment.amount)}</strong>
                </div>
                <dl className="oficinista-operations__details">
                  <div>
                    <dt>Método</dt>
                    <dd>{payment.method === 'transfer' ? 'Transferencia' : 'Depósito'}</dd>
                  </div>
                  <div>
                    <dt>Referencia</dt>
                    <dd>{payment.receiptReference || 'No indicada'}</dd>
                  </div>
                  <div>
                    <dt>Documentos de descuento</dt>
                    <dd>{payment.documents.length}</dd>
                  </div>
                </dl>
                <div className="oficinista-operations__links">
                  {payment.hasReceipt ? (
                    <a
                      href={`/api/v1/payments/${payment.id}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir comprobante
                    </a>
                  ) : (
                    <span>El comprobante no está disponible.</span>
                  )}
                  {payment.documents.map((document) => (
                    <a
                      href={`/api/v1/payments/documents/${document.id}`}
                      key={document.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Documento del asiento {document.seatId}
                    </a>
                  ))}
                </div>
                <div className="oficinista-operations__actions">
                  <button
                    type="button"
                    className="oficinista-operations__button"
                    onClick={() => void handleApprove(payment.id)}
                    disabled={processingId !== null}
                  >
                    {processingId === payment.id ? 'Procesando...' : 'Aprobar pago'}
                  </button>
                  <button
                    type="button"
                    className="oficinista-operations__button--danger"
                    onClick={() => {
                      setRejectingId(rejectingId === payment.id ? null : payment.id);
                      setError(null);
                    }}
                    disabled={processingId !== null}
                  >
                    Rechazar
                  </button>
                </div>
                {rejectingId === payment.id && (
                  <div className="oficinista-operations__reject">
                    <label>
                      Motivo del rechazo
                      <select
                        value={reason}
                        onChange={(event) =>
                          setReason(
                            event.target.value as 'payment_not_received' | 'receipt_unverifiable',
                          )
                        }
                      >
                        <option value="receipt_unverifiable">
                          No se pudo verificar el comprobante
                        </option>
                        <option value="payment_not_received">No se recibió el pago</option>
                      </select>
                    </label>
                    <label>
                      Comentario (opcional)
                      <input
                        maxLength={150}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="oficinista-operations__button--danger"
                      onClick={() => void handleReject(payment.id)}
                      disabled={processingId !== null}
                    >
                      {processingId === payment.id ? 'Procesando...' : 'Confirmar rechazo'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
