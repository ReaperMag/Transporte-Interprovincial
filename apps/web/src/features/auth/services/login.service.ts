import type { LoginCredentials } from '../types/auth.types';

export interface AuthenticatedAccount {
  accountId: number;
  email: string;
  accountType: 'passenger';
}

export async function loginPassenger(credentials: LoginCredentials): Promise<AuthenticatedAccount> {
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
