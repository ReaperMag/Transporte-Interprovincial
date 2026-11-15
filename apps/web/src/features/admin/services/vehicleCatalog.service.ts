export interface VehicleCatalogItem {
  id: number;
  name: string;
}

export interface VehicleCatalog {
  chassis: VehicleCatalogItem[];
  bodyworks: VehicleCatalogItem[];
}

export type VehicleCatalogKind = 'chassis' | 'bodyworks';

class VehicleCatalogApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'VehicleCatalogApiError';
  }
}

const catalogUrl = '/api/v1/admin/vehicle-catalog';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new VehicleCatalogApiError('No se pudo conectar con el servidor.', 0);
  }

  if (!response.ok) {
    let message = 'No fue posible procesar el catálogo vehicular.';
    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload &&
        typeof payload.detail === 'string'
      ) {
        message = payload.detail;
      }
    } catch {
      // Conserva el mensaje genérico cuando la respuesta no contiene JSON.
    }
    if (response.status === 401) message = 'Inicia sesión para continuar.';
    if (response.status === 403) message = 'No tienes permisos para administrar este catálogo.';
    throw new VehicleCatalogApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getVehicleCatalog(signal?: AbortSignal): Promise<VehicleCatalog> {
  return request(catalogUrl, { signal });
}

export function createVehicleCatalogItem(
  kind: VehicleCatalogKind,
  name: string,
): Promise<VehicleCatalogItem> {
  return request(`${catalogUrl}/${kind}`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function updateVehicleCatalogItem(
  kind: VehicleCatalogKind,
  id: number,
  name: string,
): Promise<VehicleCatalogItem> {
  return request(`${catalogUrl}/${kind}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function deleteVehicleCatalogItem(kind: VehicleCatalogKind, id: number): Promise<void> {
  return request(`${catalogUrl}/${kind}/${id}`, { method: 'DELETE' });
}
