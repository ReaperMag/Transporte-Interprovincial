export interface TripCity {
  id: number;
  name: string;
  province: string;
}

export interface TripFare {
  seatType: string;
  price: string | number;
}

export interface TripSearchResult {
  tripId: number;
  routeId: number;
  cooperativeId: number;
  cooperativeName: string;
  originCityId: number;
  originCityName: string;
  destinationCityId: number;
  destinationCityName: string;
  departureAt: string;
  durationMinutes: number | null;
  busId: number;
  busNumber: string;
  busTemplateId: number;
  fares: TripFare[];
}

/** Filtros opcionales: sin ninguno se listan todos los viajes disponibles. */
export interface TripSearchParams {
  originCityId?: number;
  destinationCityId?: number;
  travelDate?: string;
}

function getErrorMessage(status: number, fallback: string): string {
  if (status === 401) {
    return 'Tu sesión ha expirado. Inicia sesión nuevamente.';
  }

  if (status === 403) {
    return 'No tienes autorización para consultar viajes.';
  }

  if (status === 422) {
    return 'Los datos de búsqueda no son válidos.';
  }

  return fallback;
}

export async function getTripCities(): Promise<TripCity[]> {
  const response = await fetch('/api/v1/trips/cities', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, 'No se pudieron cargar las ciudades.'));
  }

  return (await response.json()) as TripCity[];
}

export async function searchPassengerTrips(
  params: TripSearchParams = {},
): Promise<TripSearchResult[]> {
  const query = new URLSearchParams();
  if (params.originCityId) query.set('origin_city_id', String(params.originCityId));
  if (params.destinationCityId) {
    query.set('destination_city_id', String(params.destinationCityId));
  }
  if (params.travelDate) query.set('travel_date', params.travelDate);

  const response = await fetch(`/api/v1/trips/search?${query.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status, 'No se pudo realizar la búsqueda de viajes.'));
  }

  return (await response.json()) as TripSearchResult[];
}
