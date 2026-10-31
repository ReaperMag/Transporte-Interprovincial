import type {
  AdminSummary,
  Cooperative,
  CooperativeAccountCreate,
  CooperativeWrite,
} from '../types/admin.types';

const cooperativesUrl = '/api/v1/admin/cooperatives';

export class AdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new AdminApiError('No se pudo conectar con el servidor. Inténtalo nuevamente.', 0);
  }

  if (!response.ok) {
    let message = 'Ocurrió un error al procesar la solicitud.';

    try {
      const payload: unknown = await response.json();
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'detail' in payload
      ) {
        const detail = payload.detail;
        if (typeof detail === 'string') {
          message = detail;
        } else if (Array.isArray(detail)) {
          message = detail
            .map((item) =>
              typeof item === 'object' && item !== null && 'msg' in item
                ? String(item.msg)
                : 'Revisa los datos ingresados.',
            )
            .join(' ');
        }
      }
    } catch {
      // Conserva el mensaje genérico si el servidor no devuelve JSON.
    }

    if (response.status === 401) {
      message = 'Inicia sesión con una cuenta administradora para continuar.';
    } else if (response.status === 403) {
      message = 'No tienes permisos para administrar cooperativas.';
    } else if (response.status === 503) {
      message = 'El servicio administrativo aún no está habilitado.';
    }

    throw new AdminApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function getCooperatives(
  search = '',
  signal?: AbortSignal,
): Promise<Cooperative[]> {
  const params = new URLSearchParams();
  if (search.trim()) params.set('search', search.trim());
  const query = params.size ? `?${params.toString()}` : '';

  return request(`${cooperativesUrl}${query}`, { signal });
}

export function getAdminSummary(signal?: AbortSignal): Promise<AdminSummary> {
  return request(`${cooperativesUrl}/summary`, { signal });
}

export function createCooperative(values: CooperativeAccountCreate): Promise<Cooperative> {
  return request(cooperativesUrl, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function updateCooperative(
  id: number,
  values: CooperativeWrite,
): Promise<Cooperative> {
  return request(`${cooperativesUrl}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}

export function deleteCooperative(id: number): Promise<void> {
  return request(`${cooperativesUrl}/${id}`, { method: 'DELETE' });
}
