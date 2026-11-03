export interface OfficeUser {
  id: number;
  accountId: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string | null;
  position: string;
}

export interface OfficeUserCreate {
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string;
  password: string;
}

export type OfficeUserUpdate = Partial<Omit<OfficeUserCreate, 'password'>>;

export class OfficeUserApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'OfficeUserApiError';
  }
}

const officeUsersUrl = '/api/v1/cooperatives/me/office-users';

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
    throw new OfficeUserApiError(
      'No se pudo conectar con el servidor. Inténtalo nuevamente.',
      0,
    );
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
      403: 'No tienes permisos para administrar oficinistas.',
      404: 'El oficinista no fue encontrado.',
      409: 'El correo o la cédula ya están registrados.',
      422: message === 'Ocurrió un error al procesar la solicitud.'
        ? 'Revisa los datos ingresados.'
        : message,
    };
    throw new OfficeUserApiError(statusMessages[response.status] ?? message, response.status);
  }

  return (await response.json()) as T;
}

export function getOfficeUsers(signal?: AbortSignal): Promise<OfficeUser[]> {
  return request<OfficeUser[]>(officeUsersUrl, { signal });
}

export function getOfficeUser(id: number): Promise<OfficeUser> {
  return request<OfficeUser>(`${officeUsersUrl}/${id}`);
}

export function createOfficeUser(values: OfficeUserCreate): Promise<OfficeUser> {
  return request<OfficeUser>(officeUsersUrl, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function updateOfficeUser(
  id: number,
  values: OfficeUserUpdate,
): Promise<OfficeUser> {
  return request<OfficeUser>(`${officeUsersUrl}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}
