export interface AssignedBus {
  id: number;
  number: string;
  plate: string;
}

export interface BusStaffMember {
  id: number;
  accountId: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  assignedBus: AssignedBus | null;
}

export interface BusStaffCreate {
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string;
  assignedBusId: number;
  password: string;
  confirmPassword: string;
}

export type BusStaffUpdate = Partial<
  Omit<BusStaffCreate, 'password' | 'confirmPassword'> & { isActive: boolean }
>;

export class BusStaffApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'BusStaffApiError';
  }
}

const busStaffUrl = '/api/v1/cooperatives/me/bus-staff';

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
    throw new BusStaffApiError('No se pudo conectar con el servidor. Inténtalo nuevamente.', 0);
  }

  if (!response.ok) {
    let message = 'Ocurrió un error al procesar la solicitud.';
    try {
      const payload: unknown = await response.json();
      if (typeof payload === 'object' && payload !== null && 'detail' in payload) {
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

    const statusMessages: Record<number, string> = {
      401: 'Tu sesión expiró. Inicia sesión nuevamente.',
      403: 'No tienes permisos para administrar al personal del bus.',
      404: 'La persona no fue encontrada.',
      409: message,
    };
    throw new BusStaffApiError(statusMessages[response.status] ?? message, response.status);
  }

  return (await response.json()) as T;
}

export function getBusStaff(signal?: AbortSignal): Promise<BusStaffMember[]> {
  return request<BusStaffMember[]>(busStaffUrl, { signal });
}

export function createBusStaff(values: BusStaffCreate): Promise<BusStaffMember> {
  return request<BusStaffMember>(busStaffUrl, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function updateBusStaff(id: number, values: BusStaffUpdate): Promise<BusStaffMember> {
  return request<BusStaffMember>(`${busStaffUrl}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}
