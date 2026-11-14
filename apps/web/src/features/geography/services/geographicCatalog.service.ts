export interface GeographicPlace {
  id: number;
  name: string;
  province: string;
  canton: string | null;
}

export interface GeographicCatalog {
  provinces: string[];
  cantons: GeographicPlace[];
  localities: GeographicPlace[];
}

export interface CantonCreate {
  name: string;
  province: string;
}

export interface LocalityCreate {
  name: string;
  province: string;
  canton: string;
}

export class GeographicApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'GeographicApiError';
  }
}

const catalogUrl = '/api/v1/geographic-catalog';
const adminCatalogUrl = '/api/v1/admin/geographic-catalog';

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
    throw new GeographicApiError('No se pudo conectar con el servidor.', 0);
  }

  if (!response.ok) {
    let message = 'No fue posible procesar el catálogo geográfico.';
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
      // Conserva el mensaje genérico si el servidor no devuelve JSON.
    }

    if (response.status === 401) {
      message = 'Inicia sesión para continuar.';
    } else if (response.status === 403) {
      message = 'No tienes permisos para administrar el catálogo geográfico.';
    }

    throw new GeographicApiError(message, response.status);
  }

  return (await response.json()) as T;
}

export function getGeographicCatalog(signal?: AbortSignal): Promise<GeographicCatalog> {
  return request(catalogUrl, { signal });
}

export function createCanton(values: CantonCreate): Promise<GeographicPlace> {
  return request(`${adminCatalogUrl}/cantons`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function createLocality(values: LocalityCreate): Promise<GeographicPlace> {
  return request(`${adminCatalogUrl}/localities`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}
