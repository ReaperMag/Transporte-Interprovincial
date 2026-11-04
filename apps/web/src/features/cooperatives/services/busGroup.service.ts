export interface CooperativeBusGroup {
  id: number;
  name: string;
  description: string | null;
  busCount: number;
}

export interface BusGroupInput {
  name: string;
  description: string | null;
}

const groupsUrl = '/api/v1/cooperatives/me/groups';

async function getErrorMessage(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return 'No fue posible completar la operación con los grupos.';
  }

  if (typeof body !== 'object' || body === null || !('detail' in body)) {
    return 'No fue posible completar la operación con los grupos.';
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
  return 'No fue posible completar la operación con los grupos.';
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

export function getCooperativeBusGroups(): Promise<CooperativeBusGroup[]> {
  return sendRequest<CooperativeBusGroup[]>(groupsUrl);
}

export function createCooperativeBusGroup(input: BusGroupInput): Promise<CooperativeBusGroup> {
  return sendRequest<CooperativeBusGroup>(groupsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateCooperativeBusGroup(
  groupId: number,
  input: BusGroupInput,
): Promise<CooperativeBusGroup> {
  return sendRequest<CooperativeBusGroup>(`${groupsUrl}/${groupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteCooperativeBusGroup(groupId: number): Promise<void> {
  return sendRequest<void>(`${groupsUrl}/${groupId}`, {
    method: 'DELETE',
  });
}
