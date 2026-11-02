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

export async function getTripSeats(
  tripId: number,
  originCityId: number,
  destinationCityId: number,
): Promise<TripSeatsResponse> {
  const params = new URLSearchParams({
    origin_city_id: String(originCityId),
    destination_city_id: String(destinationCityId),
  });

  const response = await fetch(`/api/v1/reservations/trips/${tripId}/seats?${params.toString()}`, {
    credentials: 'include',
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

    if (response.status === 401) {
      message = 'Tu sesión ha expirado. Inicia sesión nuevamente.';
    }

    throw new Error(message);
  }

  return (await response.json()) as TripSeatsResponse;
}
