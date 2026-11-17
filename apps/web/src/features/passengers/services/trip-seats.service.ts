export interface TripSeat {
  seatId: number;
  number: number;
  floor: number;
  row: number;
  column: number;
  seatType: string;
  isAvailable: boolean;
}

export interface TripSeatsResponse {
  tripId: number;
  originCityId: number;
  destinationCityId: number;
  busTemplateId: number;
  floors: number;
  rows: number;
  columns: number;
  seats: TripSeat[];
}

export interface PublicTripSeatsResponse extends TripSeatsResponse {
  fares: { seatType: string; price: string }[];
}

export async function getTripSeats(
  tripId: number,
  originCityId: number,
  destinationCityId: number,
  isPublic: true,
): Promise<PublicTripSeatsResponse>;
export async function getTripSeats(
  tripId: number,
  originCityId: number,
  destinationCityId: number,
  isPublic?: false,
): Promise<TripSeatsResponse>;
export async function getTripSeats(
  tripId: number,
  originCityId: number,
  destinationCityId: number,
  isPublic = false,
): Promise<TripSeatsResponse | PublicTripSeatsResponse> {
  const params = new URLSearchParams({
    origin_city_id: String(originCityId),
    destination_city_id: String(destinationCityId),
  });

  const prefix = isPublic ? '/api/v1/reservations/public/trips' : '/api/v1/reservations/trips';
  const response = await fetch(`${prefix}/${tripId}/seats?${params.toString()}`, {
    credentials: 'include',
    cache: 'no-store',
  });

  if (!response.ok) {
    let message = 'No se pudo consultar la disponibilidad de asientos.';

    const body: unknown = await response.json().catch(() => null);

    if (
      typeof body === 'object' &&
      body !== null &&
      'detail' in body &&
      typeof body.detail === 'string'
    ) {
      message = body.detail;
    }

    if (!isPublic && response.status === 401) {
      message = 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    }

    throw new Error(message);
  }

  return (await response.json()) as TripSeatsResponse;
}
