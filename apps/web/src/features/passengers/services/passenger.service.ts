export interface PassengerProfile {
  accountId: number;
  email: string;
  hasPassengerProfile: boolean;
  idNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  phone: string | null;
  category: string | null;
  categoryVerified: boolean | null;
}

export async function getPassengerProfile(): Promise<PassengerProfile> {
  const response = await fetch('/api/v1/passengers/me', {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('No se pudo obtener el perfil del pasajero.');
  }

  return (await response.json()) as PassengerProfile;
}

export type PassengerCategory = 'regular' | 'minor' | 'senior' | 'disability';

export interface PassengerProfileUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  birthDate?: string | null;
  category?: PassengerCategory;
}

export async function updatePassengerProfile(
  changes: PassengerProfileUpdate,
): Promise<PassengerProfile> {
  const response = await fetch('/api/v1/passengers/me', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(changes),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Tu sesión ha expirado. Inicia sesión nuevamente.');
    }

    if (response.status === 403) {
      throw new Error('No tienes autorización para actualizar el perfil.');
    }

    if (response.status === 422) {
      throw new Error('Verifica el teléfono y la fecha de nacimiento.');
    }

    throw new Error('No se pudieron guardar los cambios del perfil.');
  }

  return (await response.json()) as PassengerProfile;
}
