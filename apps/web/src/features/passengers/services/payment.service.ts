export type OnlinePaymentMethod = 'deposit' | 'transfer';

export type PaymentStatus = 'pending' | 'approved' | 'rejected';

export interface PaymentInfo {
  bankName: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
  deunaQr: string;
  isDemo: boolean;
  maxFileSizeMb: number;
  acceptedFileTypes: string[];
  receiptTimeLimitNote: string;
}

export interface PaymentDocumentRead {
  id: number;
  seatId: number;
}

export interface PaymentRead {
  id: number;
  reservationId: number;
  tripId: number;
  method: 'cash' | OnlinePaymentMethod;
  amount: string | number;
  status: PaymentStatus;
  receiptReference: string | null;
  hasReceipt: boolean;
  documents: PaymentDocumentRead[];
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  reservationStatus: string;
}

export interface PaymentDocumentInput {
  seatId: number;
  file: File;
}

export interface UploadPaymentInput {
  reservationId: number;
  method: OnlinePaymentMethod;
  receipt: File;
  receiptReference?: string;
  documents: PaymentDocumentInput[];
}

export class PaymentRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PaymentRequestError';
  }
}

async function readPaymentError(
  response: Response,
  fallback: string,
): Promise<PaymentRequestError> {
  const body: unknown = await response.json().catch(() => null);

  let message = fallback;

  if (
    typeof body === 'object' &&
    body !== null &&
    'detail' in body &&
    typeof body.detail === 'string'
  ) {
    message = body.detail;
  }

  if (response.status === 401) {
    message = 'Tu sesión ha expirado. Inicia sesión nuevamente.';
  } else if (response.status === 403) {
    message = 'No tienes autorización para realizar esta operación.';
  }

  return new PaymentRequestError(message, response.status);
}

// Consultar información bancaria y condiciones para subir archivos.
export async function getPassengerPaymentMethods(): Promise<PaymentInfo> {
  const response = await fetch('/api/v1/payments/methods', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readPaymentError(response, 'No se pudo consultar la información de pago.');
  }

  return (await response.json()) as PaymentInfo;
}

// Consultar los pagos registrados para una reserva.
export async function getPassengerReservationPayments(
  reservationId: number,
): Promise<PaymentRead[]> {
  const response = await fetch(`/api/v1/payments/reservations/${reservationId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readPaymentError(response, 'No se pudo consultar el historial de pagos.');
  }

  return (await response.json()) as PaymentRead[];
}

// Subir comprobante y documentos de respaldo mediante FormData.
export async function uploadPassengerPayment(input: UploadPaymentInput): Promise<PaymentRead> {
  const formData = new FormData();

  formData.append('method', input.method);
  formData.append('receipt', input.receipt);

  if (input.receiptReference?.trim()) {
    formData.append('receiptReference', input.receiptReference.trim());
  }

  for (const document of input.documents) {
    formData.append('documents', document.file);
    formData.append('documentSeatIds', String(document.seatId));
  }

  const response = await fetch(`/api/v1/payments/reservations/${input.reservationId}/receipt`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  // No establecer Content-Type manualmente:
  // el navegador agrega el boundary de multipart/form-data.
  if (!response.ok) {
    throw await readPaymentError(
      response,
      'No se pudo registrar el comprobante. Inténtalo nuevamente.',
    );
  }

  return (await response.json()) as PaymentRead;
}

// Confirmar compra / pago directo de una reserva para emitir boletos inmediatamente
export async function confirmPassengerPayment(
  reservationId: number,
  method: OnlinePaymentMethod = 'transfer',
): Promise<PaymentRead> {
  const formData = new FormData();
  formData.append('method', method);

  const response = await fetch(`/api/v1/payments/reservations/${reservationId}/confirm`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    throw await readPaymentError(
      response,
      'No se pudo confirmar el pago de la reserva.',
    );
  }

  return (await response.json()) as PaymentRead;
}
