export type BusOrigin = 'nacional' | 'importado';
export type BusStatus = 'operativo' | 'mantenimiento' | 'fuera_de_servicio';

export interface CooperativeBusPhoto {
  id: number;
  url: string;
}

export interface CooperativeBus {
  id: number;
  number: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  capacity: number;
  floors: number;
  origin: BusOrigin;
  status: BusStatus;
  groupId: number;
  groupName: string;
  templateId: number;
  photos: CooperativeBusPhoto[];
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

export interface CooperativeBusCreateInput extends Omit<BusInput, 'floors' | 'templateId'> {
  floors: number;
  template: {
    name: string;
    floors: number;
    hasBathroom: boolean;
    rows: number;
    columns: number;
    seats: Array<{
      number: number;
      floor: number;
      row: number;
      column: number;
      seatType: 'normal' | 'vip';
    }>;
  };
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

function busCreatePayload(input: CooperativeBusCreateInput) {
  return {
    number: input.number,
    plate: input.plate,
    brand: input.brand,
    model: input.model,
    year: input.year,
    capacity: input.capacity,
    floors: input.floors,
    origin: input.origin,
    status: input.status,
    groupId: input.groupId,
    template: {
      name: input.template.name,
      floors: input.template.floors,
      hasBathroom: input.template.hasBathroom,
      rows: input.template.rows,
      columns: input.template.columns,
      seats: input.template.seats.map(({ number, floor, row, column, seatType }) => ({
        number,
        floor,
        row,
        column,
        seatType,
      })),
    },
  };
}

export function createCooperativeBus(
  input: CooperativeBusCreateInput,
  photos: File[] = [],
): Promise<CooperativeBus> {
  if (!photos.length) {
    return request<CooperativeBus>(busesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(busCreatePayload(input)),
    });
  }

  const formData = new FormData();
  formData.set('payload', JSON.stringify(busCreatePayload(input)));
  photos.forEach((photo) => formData.append('photos', photo));

  return request<CooperativeBus>(`${busesUrl}/with-photos`, {
    method: 'POST',
    body: formData,
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

export function addCooperativeBusPhotos(id: number, photos: File[]): Promise<CooperativeBusPhoto[]> {
  const formData = new FormData();
  photos.forEach((photo) => formData.append('photos', photo));
  return request<CooperativeBusPhoto[]>(`${busesUrl}/${id}/photos`, {
    method: 'POST',
    body: formData,
  });
}

export function deleteCooperativeBusPhoto(id: number, photoId: number): Promise<void> {
  return request<void>(`${busesUrl}/${id}/photos/${photoId}`, { method: 'DELETE' });
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
