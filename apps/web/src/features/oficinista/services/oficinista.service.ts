import type { OficinistaInfo } from '../types/oficinista.types';
import type {
  TripCity,
  TripSearchParams,
  TripSearchResult,
} from '../../passengers/services/trip.service';
import type {
  ReservationCreate,
  ReservationRead,
} from '../../passengers/services/reservation.service';
import type { TripSeatsResponse } from '../../passengers/services/trip-seats.service';
import type { TicketRead } from '../../passengers/services/ticket.service';

export async function getOficinistaInfo(): Promise<OficinistaInfo | null> {
  const response = await fetch('/api/v1/staff/me', {
    credentials: 'same-origin',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('No fue posible obtener la información del oficinista.');
  }

  const data = (await response.json()) as Omit<OficinistaInfo, 'fullName'>;
  return { ...data, fullName: `${data.firstName} ${data.lastName}` };
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  if (
    typeof body === 'object' &&
    body !== null &&
    'detail' in body &&
    typeof body.detail === 'string'
  ) {
    return new Error(body.detail);
  }
  if (response.status === 401) {
    return new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
  }
  if (response.status === 403) {
    return new Error('No tienes autorización para esta operación.');
  }
  return new Error(fallback);
}

export async function getOfficeTripCities(): Promise<TripCity[]> {
  const response = await fetch('/api/v1/trips/cities-for-sale', {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw await readError(response, 'No se pudieron cargar las ciudades de las rutas.');
  }
  return (await response.json()) as TripCity[];
}

export async function searchOfficeTrips(params: TripSearchParams): Promise<TripSearchResult[]> {
  const query = new URLSearchParams({
    origin_city_id: String(params.originCityId),
    destination_city_id: String(params.destinationCityId),
    travel_date: params.travelDate,
  });
  const response = await fetch(`/api/v1/trips/search-for-sale?${query}`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw await readError(response, 'No se pudieron consultar los viajes disponibles.');
  }
  return (await response.json()) as TripSearchResult[];
}

export async function createOfficeReservation(
  payload: ReservationCreate,
): Promise<ReservationRead> {
  const response = await fetch('/api/v1/reservations/office', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw await readError(response, 'No se pudo crear la venta en oficina.');
  }
  return (await response.json()) as ReservationRead;
}

export async function getOfficeTripSeats(
  tripId: number,
  originCityId: number,
  destinationCityId: number,
): Promise<TripSeatsResponse> {
  const query = new URLSearchParams({
    origin_city_id: String(originCityId),
    destination_city_id: String(destinationCityId),
  });
  const response = await fetch(`/api/v1/reservations/trips/${tripId}/seats?${query}`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw await readError(response, 'No se pudo consultar la disponibilidad de asientos.');
  }
  return (await response.json()) as TripSeatsResponse;
}

export async function chargeOfficeReservation(reservationId: number): Promise<void> {
  const response = await fetch(`/api/v1/payments/reservations/${reservationId}/cash`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw await readError(response, 'No se pudo registrar el cobro en efectivo.');
  }
}

export async function getOfficeReservationTickets(reservationId: number): Promise<TicketRead[]> {
  const response = await fetch(`/api/v1/tickets/reservations/${reservationId}`, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw await readError(
      response,
      'El cobro se registró, pero no se pudieron cargar los boletos.',
    );
  }
  return (await response.json()) as TicketRead[];
}
