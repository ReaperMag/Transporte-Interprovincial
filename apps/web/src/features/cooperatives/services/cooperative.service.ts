export interface CooperativeIdentity {
  id: number;
  name: string;
  ruc: string;
}

export interface CooperativeProfile extends CooperativeIdentity {
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
}

export interface CooperativeRouteFrequencyAssignment {
  busId: number;
  busNumber: string;
  plate: string;
  routeId: number;
  originCity: string;
  destinationCity: string;
  departureTime: string;
  resolutionNumber: string;
  tripCount: number;
  lastDepartureAt: string | null;
}

export interface CooperativeRouteFrequencySummary {
  activeRoutes: number;
  activeFrequencies: number;
  busAssignments: CooperativeRouteFrequencyAssignment[];
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

export async function getAuthenticatedCooperativeProfile(): Promise<CooperativeProfile> {
  const response = await fetch('/api/v1/cooperatives/me/profile', {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('No fue posible obtener la configuración de la cooperativa.');
  }

  return (await response.json()) as CooperativeProfile;
}

export async function getCooperativeRouteFrequencySummary(): Promise<CooperativeRouteFrequencySummary> {
  const response = await fetch('/api/v1/cooperatives/me/route-frequency-summary', {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('No fue posible obtener el resumen de rutas y frecuencias.');
  }

  return (await response.json()) as CooperativeRouteFrequencySummary;
}

export async function updateAuthenticatedCooperativeProfile(
  profile: Omit<CooperativeProfile, 'id' | 'name' | 'ruc'>,
): Promise<CooperativeProfile> {
  const response = await fetch('/api/v1/cooperatives/me/profile', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });

  if (!response.ok) {
    const body: unknown = await response.json();
    const detail =
      typeof body === 'object' && body !== null && 'detail' in body ? body.detail : undefined;
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((item) =>
                typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : '',
              )
              .filter(Boolean)
              .join(' ')
          : '';
    throw new Error(message || 'No fue posible guardar la configuración.');
  }

  return (await response.json()) as CooperativeProfile;
}
