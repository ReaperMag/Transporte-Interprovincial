export type BusOrigin = 'nacional' | 'importado';
export type BusStatus = 'operativo' | 'mantenimiento' | 'fuera_de_servicio';

export interface CooperativeBus {
  id: number;
  number: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  capacity: number;
  floors: 2;
  origin: BusOrigin;
  status: BusStatus;
  groupId: number;
  groupName: string;
  templateId: number;
}

export interface BusInput {
  number: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  capacity: number;
  floors: 2;
  origin: BusOrigin;
  status: BusStatus;
  groupId: number;
  templateId: number;
}

const busesUrl = '/api/v1/cooperatives/me/buses';

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === 'object' && body !== null && 'detail' in body) {
      const detail = body.detail;

      if (typeof detail === 'string') return detail;

      if (Array.isArray(detail)) {
        return detail
          .map((item) =>
            typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '',
          )
          .filter(Boolean)
          .join(' ');
      }
    }
  } catch {
    // Use the standard message when the server does not return JSON.
  }

  return 'No fue posible completar la operación con los buses.';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getCooperativeBuses(filters?: {
  plate?: string;
  groupId?: number;
  status?: BusStatus;
}): Promise<CooperativeBus[]> {
  const params = new URLSearchParams();

  if (filters?.plate) params.set('plate', filters.plate);
  if (filters?.groupId) params.set('groupId', String(filters.groupId));
  if (filters?.status) params.set('status', filters.status);

  const query = params.toString();

  return request<CooperativeBus[]>(query ? `${busesUrl}?${query}` : busesUrl);
}

export function createCooperativeBus(input: BusInput): Promise<CooperativeBus> {
  return request<CooperativeBus>(busesUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateCooperativeBus(
  id: number,
  input: Partial<BusInput>,
): Promise<CooperativeBus> {
  return request<CooperativeBus>(`${busesUrl}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateCooperativeBusStatus(id: number, status: BusStatus): Promise<CooperativeBus> {
  return request<CooperativeBus>(`${busesUrl}/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function deleteCooperativeBus(id: number): Promise<void> {
  return request<void>(`${busesUrl}/${id}`, {
    method: 'DELETE',
  });
}
