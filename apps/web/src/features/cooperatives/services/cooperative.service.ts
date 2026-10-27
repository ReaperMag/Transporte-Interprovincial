export interface CooperativeIdentity {
  id: number;
  name: string;
  ruc: string;
}

export async function getAuthenticatedCooperative(): Promise<CooperativeIdentity> {
  const response = await fetch('/api/v1/cooperatives/me', {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('No fue posible obtener la información de la cooperativa.');
  }

  return (await response.json()) as CooperativeIdentity;
}
