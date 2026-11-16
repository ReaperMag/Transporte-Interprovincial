/** Catálogos globales administrados por Administración, consultados en modo lectura. */
export interface CooperativeVehicleCatalogItem {
  id: number;
  name: string;
  imageUrl: string | null;
  originCountry: string | null;
  location: string | null;
}

export interface CooperativeVehicleCatalog {
  chassis: CooperativeVehicleCatalogItem[];
  bodyworks: CooperativeVehicleCatalogItem[];
  bodyworkLocations: string[];
}

const catalogUrl = '/api/v1/cooperatives/me/vehicle-catalog';

export async function getCooperativeVehicleCatalog(
  signal?: AbortSignal,
): Promise<CooperativeVehicleCatalog> {
  let response: Response;

  try {
    response = await fetch(catalogUrl, {
      credentials: 'same-origin',
      signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    throw new Error('No se pudo conectar con el servidor para cargar las marcas.', {
      cause: error,
    });
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Inicia sesión para consultar las marcas de vehículos.');
    }

    if (response.status === 403) {
      throw new Error('Tu cuenta no tiene acceso al catálogo de vehículos de Cooperativa.');
    }

    throw new Error('No fue posible cargar las marcas del catálogo global.');
  }

  return (await response.json()) as CooperativeVehicleCatalog;
}
