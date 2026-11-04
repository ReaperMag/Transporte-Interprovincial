export interface RouteCity {
  id: number;
  name: string;
  province: string;
}

export interface RouteStop {
  cityId: number;
  cityName: string;
  province: string;
  stopOrder: number;
  minutesFromOrigin: number;
}

export interface CooperativeRoute {
  id: number;
  originCityId: number;
  originCity: string;
  originProvince: string;
  destinationCityId: number;
  destinationCity: string;
  destinationProvince: string;
  durationMinutes: number | null;
  routeType: 'direct' | 'with_stops';
  isActive: boolean;
  stops: RouteStop[];
}

export interface CooperativeFrequency {
  id: number;
  routeId: number;
  busGroupId: number | null;
  departureTime: string;
  resolutionNumber: string;
  routeName: string;
  durationMinutes: number | null;
  stops: string[];
}

export interface ScheduleBus {
  id: number;
  number: string;
  plate: string;
  status: 'operativo' | 'mantenimiento' | 'fuera_de_servicio';
  isActive: boolean;
}

export interface RouteSheetFrequency {
  frequencyId: number;
  routeId: number;
  routeName: string;
  departureTime: string;
  durationMinutes: number | null;
  resolutionNumber: string;
  stops: string[];
  busId: number | null;
}

export interface RouteSheet {
  id: number | null;
  busGroupId: number;
  serviceDate: string;
  status: 'draft' | 'published' | null;
  canReassign: boolean;
  frequencies: RouteSheetFrequency[];
  buses: ScheduleBus[];
  startingLocations: Array<{ busId: number; cityId: number }>;
}

const routePlanningUrl = '/api/v1/cooperatives/me/route-planning';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  if (!response.ok) {
    let message = 'No fue posible completar la operación de rutas y frecuencias.';
    try {
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'detail' in body) {
        const detail = body.detail;
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = detail
            .map((item) =>
              typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '',
            )
            .filter(Boolean)
            .join(' ');
        }
      }
    } catch {
      throw new Error(message);
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function getRouteCities(): Promise<RouteCity[]> {
  return request<RouteCity[]>(`${routePlanningUrl}/cities`);
}

export function createRouteCity(input: Omit<RouteCity, 'id'>): Promise<RouteCity> {
  return request<RouteCity>(`${routePlanningUrl}/cities`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCooperativeRoutes(): Promise<CooperativeRoute[]> {
  return request<CooperativeRoute[]>(`${routePlanningUrl}/routes`);
}

export function createCooperativeRoute(input: {
  originCityId: number;
  destinationCityId: number;
  durationMinutes: number;
  stops: Array<{ cityId: number; minutesFromOrigin: number }>;
}): Promise<CooperativeRoute> {
  return request<CooperativeRoute>(`${routePlanningUrl}/routes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getCooperativeFrequencies(groupId?: number): Promise<CooperativeFrequency[]> {
  const query = groupId ? `?groupId=${groupId}` : '';
  return request<CooperativeFrequency[]>(`${routePlanningUrl}/frequencies${query}`);
}

export function createCooperativeFrequency(input: {
  routeId: number;
  busGroupId: number;
  departureTime: string;
  resolutionNumber: string;
}): Promise<CooperativeFrequency> {
  return request<CooperativeFrequency>(`${routePlanningUrl}/frequencies`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getRouteSheet(groupId: number, serviceDate: string): Promise<RouteSheet> {
  const params = new URLSearchParams({
    groupId: String(groupId),
    serviceDate,
  });
  return request<RouteSheet>(`${routePlanningUrl}/route-sheets?${params}`);
}

export function saveRouteSheet(input: {
  busGroupId: number;
  serviceDate: string;
  assignments: Array<{ frequencyId: number; busId: number | null }>;
  startingLocations: Array<{ busId: number; cityId: number }>;
}): Promise<RouteSheet> {
  return request<RouteSheet>(`${routePlanningUrl}/route-sheets`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function publishRouteSheet(sheetId: number): Promise<RouteSheet> {
  return request<RouteSheet>(`${routePlanningUrl}/route-sheets/${sheetId}/publish`, {
    method: 'POST',
  });
}
