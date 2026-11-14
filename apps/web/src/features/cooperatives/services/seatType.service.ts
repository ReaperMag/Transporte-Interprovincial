export interface CooperativeSeatType {
  id: number;
  name: string;
  percentage: string;
}

export interface SeatTypeInput {
  name: string;
  percentage: string;
}

const seatTypesUrl = '/api/v1/cooperatives/me/seat-types';

async function getErrorMessage(response: Response): Promise<string> {
  let body: unknown;

  try {
    body = await response.json();
  } catch {
    return 'No fue posible completar la operación con los tipos de asiento.';
  }

  if (typeof body !== 'object' || body === null || !('detail' in body)) {
    return 'No fue posible completar la operación con los tipos de asiento.';
  }

  const { detail } = body;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) =>
        typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '',
      )
      .filter(Boolean)
      .join(' ');
  }

  return 'No fue posible completar la operación con los tipos de asiento.';
}

async function sendRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getCooperativeSeatTypes(): Promise<CooperativeSeatType[]> {
  return sendRequest<CooperativeSeatType[]>(seatTypesUrl);
}

export function getCooperativeSeatType(seatTypeId: number): Promise<CooperativeSeatType> {
  return sendRequest<CooperativeSeatType>(`${seatTypesUrl}/${seatTypeId}`);
}

export function createCooperativeSeatType(input: SeatTypeInput): Promise<CooperativeSeatType> {
  return sendRequest<CooperativeSeatType>(seatTypesUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateCooperativeSeatType(
  seatTypeId: number,
  input: Partial<SeatTypeInput>,
): Promise<CooperativeSeatType> {
  return sendRequest<CooperativeSeatType>(`${seatTypesUrl}/${seatTypeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteCooperativeSeatType(seatTypeId: number): Promise<void> {
  return sendRequest<void>(`${seatTypesUrl}/${seatTypeId}`, {
    method: 'DELETE',
  });
}
