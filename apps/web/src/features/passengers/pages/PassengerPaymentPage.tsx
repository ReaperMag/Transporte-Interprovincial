import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getPassengerReservations, type ReservationRead } from '../services/reservation.service';
import {
  getPassengerPaymentMethods,
  getPassengerReservationPayments,
  savePassengerPaymentMethod,
  uploadPassengerPayment,
  type OnlinePaymentMethod,
  type PaymentInfo,
  type PaymentRead,
} from '../services/payment.service';
import './PassengerTripSearchPage.css';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value));
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guayaquil',
  });
}

function getPaymentStatusLabel(status: string, hasReceipt: boolean): string {
  switch (status) {
    case 'pending':
      return hasReceipt ? 'Pendiente de revisión' : 'Pendiente de comprobante';
    case 'approved':
      return 'Aprobado';
    case 'rejected':
      return 'Rechazado';
    default:
      return status;
  }
}

function getReservationStatusLabel(status: string): string {
  switch (status) {
    case 'pending_payment':
      return 'Pendiente de pago';
    case 'payment_review':
      return 'Pago en revisión';
    case 'confirmed':
      return 'Confirmada';
    case 'expired':
      return 'Vencida';
    case 'cancelled':
      return 'Cancelada';
    default:
      return status;
  }
}

function getMethodLabel(method: string): string {
  switch (method) {
    case 'deposit':
      return 'Depósito';
    case 'transfer':
      return 'Transferencia';
    case 'cash':
      return 'Efectivo';
    default:
      return method;
  }
}

function getRejectionLabel(reason: string): string {
  switch (reason) {
    case 'payment_not_received':
      return 'No se recibió el pago';
    case 'receipt_unverifiable':
      return 'No se pudo verificar el comprobante';
    default:
      return reason;
  }
}

export function PassengerPaymentPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const location = useLocation();
  const parsedReservationId = Number(reservationId);

  const validReservationId = Number.isSafeInteger(parsedReservationId) && parsedReservationId > 0;

  const [reservation, setReservation] = useState<ReservationRead | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRead[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingMethod, setSavingMethod] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const requestedMethod =
    typeof location.state === 'object' &&
    location.state !== null &&
    'paymentMethod' in location.state &&
    (location.state.paymentMethod === 'deposit' || location.state.paymentMethod === 'transfer')
      ? location.state.paymentMethod
      : '';
  const [method, setMethod] = useState<OnlinePaymentMethod | ''>(requestedMethod);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptReference, setReceiptReference] = useState('');
  const [documentFiles, setDocumentFiles] = useState<Record<number, File>>({});

  useEffect(() => {
    let active = true;

    async function loadPaymentData() {
      if (!validReservationId) {
        setError('El identificador de la reserva no es válido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [reservations, methods, previousPayments] = await Promise.all([
          getPassengerReservations(),
          getPassengerPaymentMethods(),
          getPassengerReservationPayments(parsedReservationId),
        ]);

        if (!active) return;

        const selectedReservation = reservations.find((item) => item.id === parsedReservationId);

        if (!selectedReservation) {
          setError('No se encontró esta reserva en tu cuenta.');
          return;
        }

        setReservation(selectedReservation);
        setPaymentInfo(methods);
        setPayments(previousPayments);
        const pendingSelection = previousPayments.find(
          (payment) => payment.status === 'pending' && !payment.hasReceipt,
        );
        setMethod(requestedMethod || pendingSelection?.method || '');
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'No se pudo cargar la información del pago.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPaymentData();

    return () => {
      active = false;
    };
  }, [parsedReservationId, validReservationId, requestedMethod]);

  // Identificar documentos de descuento entregados anteriormente.
  const uploadedDocumentSeatIds = new Set(
    payments.flatMap((payment) => payment.documents.map((document) => document.seatId)),
  );

  const requiredDocumentSeats =
    reservation?.seats.filter(
      (seat) => seat.passengerCategory !== 'regular' && !uploadedDocumentSeatIds.has(seat.seatId),
    ) ?? [];

  const canUpload = reservation?.status === 'pending_payment';

  const acceptedFileTypes = paymentInfo?.acceptedFileTypes.join(',') ?? '';
  const acceptedReceiptFileTypes = paymentInfo?.acceptedReceiptFileTypes.join(',') ?? '';

  const maxFileSizeMb = paymentInfo?.maxFileSizeMb ?? 0;

  function validateFile(
    file: File,
    acceptedTypes: string[] = paymentInfo?.acceptedFileTypes ?? [],
  ): string | null {
    if (!paymentInfo) {
      return 'No se ha cargado la configuración de archivos.';
    }

    const maxBytes = paymentInfo.maxFileSizeMb * 1024 * 1024;

    if (file.size > maxBytes) {
      return `El archivo "${file.name}" supera el límite de ${maxFileSizeMb} MB.`;
    }
    if (!acceptedTypes.includes(file.type)) {
      return 'El archivo debe ser una imagen JPG o PNG.';
    }

    return null;
  }

  function handleDocumentChange(seatId: number, file?: File) {
    setDocumentFiles((current) => {
      const updated = { ...current };

      if (file) {
        updated[seatId] = file;
      } else {
        delete updated[seatId];
      }

      return updated;
    });
  }

  async function handleMethodChange(nextMethod: OnlinePaymentMethod | '') {
    if (!reservation || savingMethod || submitting) return;

    if (!nextMethod) {
      setMethod('');
      return;
    }

    const previousMethod = method;
    setMethod(nextMethod);
    setActionError(null);
    setSavingMethod(true);

    try {
      const payment = await savePassengerPaymentMethod(reservation.id, nextMethod);
      setPayments((current) => [...current.filter((item) => item.id !== payment.id), payment]);
    } catch (err) {
      setMethod(previousMethod);
      setActionError(err instanceof Error ? err.message : 'No se pudo guardar el método de pago.');
    } finally {
      setSavingMethod(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!reservation || !paymentInfo || submitting || !canUpload) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);

    if (!method) {
      setActionError('Selecciona un método de pago.');
      return;
    }

    if (!receipt) {
      setActionError('Selecciona el comprobante del pago.');
      return;
    }

    const receiptError = validateFile(receipt, paymentInfo.acceptedReceiptFileTypes);

    if (receiptError) {
      setActionError(receiptError);
      return;
    }

    const documents = [];

    for (const seat of requiredDocumentSeats) {
      const file = documentFiles[seat.seatId];

      if (!file) {
        setActionError(
          `Debes adjuntar la cédula o carné del pasajero del asiento ${seat.seatNumber}.`,
        );
        return;
      }

      const documentError = validateFile(file);

      if (documentError) {
        setActionError(documentError);
        return;
      }

      documents.push({
        seatId: seat.seatId,
        file,
      });
    }

    setSubmitting(true);

    try {
      const payment = await uploadPassengerPayment({
        reservationId: reservation.id,
        method,
        receipt,
        receiptReference,
        documents,
      });

      setPayments((current) => [...current.filter((item) => item.id !== payment.id), payment]);

      setReservation((current) =>
        current ? { ...current, status: payment.reservationStatus } : current,
      );

      setSuccessMessage(
        'Comprobante registrado correctamente. Tu pago está pendiente de revisión por el oficinista.',
      );

      setReceipt(null);
      setReceiptReference('');
      setDocumentFiles({});
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo enviar el comprobante.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="passenger-trip-search">
      <header className="passenger-trip-search__header">
        <p className="passenger-trip-search__eyebrow">PAGO DE RESERVA</p>
        <h1>Registrar comprobante</h1>
        <p>
          Consulta los datos de pago y adjunta tu comprobante para que el oficinista pueda
          revisarlo.
        </p>
      </header>

      <p>
        <Link to="/pasajero/reservas">Volver a Mis reservas</Link>
      </p>

      {loading && <p role="status">Cargando información de pago...</p>}

      {error && (
        <div role="alert" className="passenger-trip-search__error">
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && reservation && paymentInfo && (
        <div
          style={{
            display: 'grid',
            gap: '1.5rem',
            marginTop: '1.5rem',
          }}
        >
          {/* Resumen de la reserva */}
          <article className="passenger-trip-search__card">
            <h2>Reserva #{reservation.id}</h2>

            <p>
              <strong>Estado:</strong> {getReservationStatusLabel(reservation.status)}
            </p>

            <p>
              <strong>Salida:</strong> {formatDate(reservation.departureAt)}
            </p>

            <p>
              <strong>Asientos:</strong>{' '}
              {reservation.seats.map((seat) => seat.seatNumber).join(', ')}
            </p>

            <p>
              <strong>Total a pagar:</strong> {formatMoney(reservation.total)}
            </p>

            {reservation.status === 'pending_payment' && reservation.expiresAt && (
              <p>
                <strong>Reserva válida hasta:</strong> {formatDate(reservation.expiresAt)}
              </p>
            )}
          </article>

          {/* Información de pago */}
          <article className="passenger-trip-search__card">
            <h2>Información para realizar el pago</h2>

            {paymentInfo.isDemo && (
              <p role="note">
                <strong>Importante:</strong> estos son datos de demostración. No realices
                transferencias ni depósitos de dinero real a estas cuentas.
              </p>
            )}

            <p>
              <strong>Banco:</strong> {paymentInfo.bankName}
            </p>

            <p>
              <strong>Tipo de cuenta:</strong> {paymentInfo.accountType}
            </p>

            <p>
              <strong>Número de cuenta:</strong> {paymentInfo.accountNumber}
            </p>

            <p>
              <strong>Titular:</strong> {paymentInfo.accountHolder}
            </p>
            <p>
              <strong>Cédula/RUC:</strong> {paymentInfo.accountIdNumber}
            </p>
            <p>
              <strong>Correo:</strong> {paymentInfo.accountEmail}
            </p>

            {paymentInfo.deunaQr && (
              <div style={{ marginTop: '1rem' }}>
                <h3>Información DeUna</h3>

                {paymentInfo.deunaQr.startsWith('data:image/') ||
                paymentInfo.deunaQr.startsWith('/') ||
                paymentInfo.deunaQr.startsWith('https://') ||
                paymentInfo.deunaQr.startsWith('http://') ? (
                  <img
                    src={paymentInfo.deunaQr}
                    alt="Código QR DeUna proporcionado por el sistema"
                    style={{
                      display: 'block',
                      maxWidth: '200px',
                      width: '100%',
                      height: 'auto',
                    }}
                  />
                ) : (
                  <p style={{ overflowWrap: 'anywhere' }}>{paymentInfo.deunaQr}</p>
                )}
              </div>
            )}

            <p>{paymentInfo.receiptTimeLimitNote}</p>
          </article>

          {successMessage && (
            <p role="status" style={{ color: '#15803d' }}>
              {successMessage}
            </p>
          )}

          {actionError && (
            <div role="alert" className="passenger-trip-search__error">
              <p>{actionError}</p>
            </div>
          )}

          {/* Formulario disponible solo para reservas pendientes */}
          {canUpload && (
            <article className="passenger-trip-search__card">
              <h2>Subir comprobante de pago</h2>

              <form
                onSubmit={(event) => {
                  void handleSubmit(event);
                }}
                style={{
                  display: 'grid',
                  gap: '1.25rem',
                  marginTop: '1.5rem',
                }}
              >
                <div>
                  <label htmlFor="payment-method">
                    <strong>Método de pago</strong>
                  </label>

                  <select
                    id="payment-method"
                    value={method}
                    onChange={(event) => {
                      void handleMethodChange(event.target.value as OnlinePaymentMethod | '');
                    }}
                    required
                    disabled={submitting || savingMethod}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem',
                      marginTop: '0.5rem',
                    }}
                  >
                    <option value="" disabled={Boolean(method)}>
                      Selecciona una opción
                    </option>
                    <option value="deposit">Depósito bancario</option>
                    <option value="transfer">Transferencia bancaria</option>
                  </select>
                  {savingMethod && <p role="status">Guardando método de pago...</p>}
                </div>

                <div>
                  <label htmlFor="payment-reference">
                    <strong>Referencia del comprobante</strong>
                  </label>

                  <input
                    id="payment-reference"
                    type="text"
                    maxLength={100}
                    value={receiptReference}
                    onChange={(event) => setReceiptReference(event.target.value)}
                    placeholder="Número de transacción (opcional)"
                    disabled={submitting}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '0.75rem',
                      marginTop: '0.5rem',
                    }}
                  />
                </div>

                <div>
                  <label htmlFor="payment-receipt">
                    <strong>Evidencia de pago (imagen JPG o PNG)</strong>
                  </label>

                  <input
                    id="payment-receipt"
                    type="file"
                    accept={acceptedReceiptFileTypes}
                    required
                    disabled={submitting}
                    onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
                    style={{
                      display: 'block',
                      marginTop: '0.5rem',
                    }}
                  />

                  <p>
                    Tamaño máximo: {maxFileSizeMb} MB. Formatos admitidos:{' '}
                    {paymentInfo.acceptedReceiptFileTypes.join(', ')}.
                  </p>
                </div>

                {requiredDocumentSeats.length > 0 && (
                  <div>
                    <h3>Documentos para descuentos</h3>

                    <p>Adjunta la cédula o carné correspondiente a cada pasajero con descuento.</p>

                    <div
                      style={{
                        display: 'grid',
                        gap: '1rem',
                        marginTop: '1rem',
                      }}
                    >
                      {requiredDocumentSeats.map((seat) => (
                        <div key={seat.seatId}>
                          <label htmlFor={`document-seat-${seat.seatId}`}>
                            <strong>
                              Asiento {seat.seatNumber} — {seat.passengerName}
                            </strong>
                          </label>

                          <input
                            id={`document-seat-${seat.seatId}`}
                            type="file"
                            accept={acceptedFileTypes}
                            required
                            disabled={submitting}
                            onChange={(event) =>
                              handleDocumentChange(seat.seatId, event.target.files?.[0])
                            }
                            style={{
                              display: 'block',
                              marginTop: '0.5rem',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="passenger-trip-search__button"
                  disabled={submitting}
                >
                  {submitting ? 'Enviando comprobante...' : 'Enviar comprobante'}
                </button>
              </form>
            </article>
          )}

          {/* Estados que no admiten un nuevo comprobante */}
          {reservation.status === 'payment_review' && (
            <article className="passenger-trip-search__card">
              <h2>Pago en revisión</h2>
              <p>
                Ya registraste tu comprobante. El oficinista debe revisarlo antes de confirmar tu
                compra.
              </p>
            </article>
          )}

          {reservation.status === 'confirmed' && (
            <article className="passenger-trip-search__card">
              <h2>Reserva confirmada</h2>
              <p>
                Tu reserva está confirmada. Puedes consultar el historial de pagos a continuación.
              </p>
            </article>
          )}

          {(reservation.status === 'expired' || reservation.status === 'cancelled') && (
            <article className="passenger-trip-search__card">
              <h2>Reserva no disponible para pago</h2>
              <p>
                Esta reserva está {getReservationStatusLabel(reservation.status).toLowerCase()} y no
                admite nuevos comprobantes.
              </p>
            </article>
          )}

          {/* Historial de pagos */}
          <article className="passenger-trip-search__card">
            <h2>Historial de pagos</h2>

            {payments.length === 0 ? (
              <p>Todavía no hay pagos registrados.</p>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    style={{
                      borderTop: '1px solid #ddd',
                      paddingTop: '1rem',
                    }}
                  >
                    <h3>Pago #{payment.id}</h3>

                    <p>
                      <strong>Estado:</strong>{' '}
                      {getPaymentStatusLabel(payment.status, payment.hasReceipt)}
                    </p>

                    <p>
                      <strong>Método:</strong> {getMethodLabel(payment.method)}
                    </p>

                    <p>
                      <strong>Valor:</strong> {formatMoney(payment.amount)}
                    </p>

                    <p>
                      <strong>Fecha:</strong> {formatDate(payment.createdAt)}
                    </p>

                    {payment.receiptReference && (
                      <p>
                        <strong>Referencia:</strong> {payment.receiptReference}
                      </p>
                    )}

                    {payment.rejectionReason && (
                      <p>
                        <strong>Motivo del rechazo:</strong>{' '}
                        {getRejectionLabel(payment.rejectionReason)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
