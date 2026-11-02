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
