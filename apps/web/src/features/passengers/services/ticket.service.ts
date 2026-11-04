import type { PassengerCategory } from './reservation.service';

export type TicketValidity = 'valid' | 'used' | 'cancelled' | 'expired';

export interface TicketRead {
  id: number;
  code: string;
  status: string;
  validity: TicketValidity;
  channel: string;

  reservationId: number | null;
  tripId: number;
  cooperativeName: string;
  busNumber: string;
  departureAt: string;

  originCityName: string;
  destinationCityName: string;

  seatId: number;
  seatNumber: number;
  seatType: string;

  passengerName: string;
  passengerIdNumber: string;
  passengerCategory: PassengerCategory;

  price: string | number;
  issuedAt: string;
}

export class TicketRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TicketRequestError';
  }
}

async function readTicketError(response: Response, fallback: string): Promise<TicketRequestError> {
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
    message = 'No tienes autorización para consultar estos boletos.';
  }

  return new TicketRequestError(message, response.status);
}

// Consultar todos los boletos del pasajero autenticado.
export async function getPassengerTickets(): Promise<TicketRead[]> {
  const response = await fetch('/api/v1/tickets/me', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readTicketError(response, 'No se pudieron consultar tus boletos.');
  }

  return (await response.json()) as TicketRead[];
}

// Consultar los boletos correspondientes a una reserva.
export async function getPassengerReservationTickets(reservationId: number): Promise<TicketRead[]> {
  const response = await fetch(`/api/v1/tickets/reservations/${reservationId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readTicketError(response, 'No se pudieron consultar los boletos de esta reserva.');
  }

  return (await response.json()) as TicketRead[];
}

// Obtener la dirección del QR generado por el backend.
export function getPassengerTicketQrUrl(ticketId: number): string {
  return `/api/v1/tickets/${ticketId}/qr`;
}
// Obtener el enlace firmado para guardar el boleto en Google Wallet.
export async function getPassengerGoogleWalletUrl(ticketId: number): Promise<string> {
  const response = await fetch(`/api/v1/tickets/${ticketId}/wallet/google`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readTicketError(response, 'No se pudo preparar Google Wallet.');
  }

  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body !== 'object' ||
    body === null ||
    !('url' in body) ||
    typeof body.url !== 'string' ||
    !body.url.startsWith('https://pay.google.com/gp/v/save/') ||
    body.url.length <= 'https://pay.google.com/gp/v/save/'.length
  ) {
    throw new TicketRequestError('El servidor devolvió un enlace de Google Wallet inválido.', 502);
  }

  return body.url;
}
// Obtener el archivo .pkpass firmado para Apple Wallet.
export async function getPassengerAppleWalletPass(ticketId: number): Promise<Blob> {
  const response = await fetch(`/api/v1/tickets/${ticketId}/wallet/apple`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readTicketError(response, 'No se pudo preparar Apple Wallet.');
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();

  if (contentType !== 'application/vnd.apple.pkpass') {
    throw new TicketRequestError('El servidor no devolvió un pase de Apple Wallet válido.', 502);
  }

  const pass = await response.blob();

  if (pass.size === 0) {
    throw new TicketRequestError('El pase de Apple Wallet está vacío.', 502);
  }

  return pass;
}
