import type { LoginCredentials } from '../types/auth.types';
import { readApiError } from './authApi';

/** Código que envía la API cuando el pasajero no ha verificado su correo. */
export const EMAIL_NOT_VERIFIED = 'email_not_verified';

export interface AuthenticatedAccount {
  accountId: number;
  email: string;
  accountType: 'passenger' | 'cooperative' | 'super_admin';
}

export async function loginAccount(credentials: LoginCredentials): Promise<AuthenticatedAccount> {
  let response: Response;

  try {
    response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(credentials),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }

  if (response.status === 401) {
    throw new Error('Correo o contraseña incorrectos.');
  }

  if (response.status === 429) {
    throw new Error('Demasiados intentos de inicio de sesión. Inténtalo en unos minutos.');
  }

  if (response.status === 403) {
    const error = await readApiError(response, 'La API rechazó el origen del frontend');

    // El pasajero aún no verifica su correo: la pantalla de inicio de sesión
    // lo lleva a la verificación.
    if (error.code === EMAIL_NOT_VERIFIED) {
      throw error;
    }

    throw new Error('La API rechazó el origen del frontend');
  }

  if (!response.ok) {
    throw new Error('No fue posible iniciar sesión.');
  }

  return (await response.json()) as AuthenticatedAccount;
}

export async function getCurrentAccount(): Promise<AuthenticatedAccount | null> {
  const response = await fetch('/api/v1/auth/me', {
    credentials: 'same-origin',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('No fue posible verificar la sesión.');
  }

  return (await response.json()) as AuthenticatedAccount;
}

export async function logoutPassenger(): Promise<void> {
  const response = await fetch('/api/v1/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('No fue posible cerrar sesión.');
  }
}
