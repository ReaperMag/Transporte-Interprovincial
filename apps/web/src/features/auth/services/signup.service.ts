import type { SignupFormValues } from '../types/signup.types';

export interface SignupResponse {
  accountId: number;
  email: string;
  accountType: 'passenger';
}

export class SignupApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SignupApiError';
  }
}

export async function registerPassenger(values: SignupFormValues): Promise<SignupResponse> {
  let response: Response;

  try {
    response = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(values),
    });
  } catch {
    throw new SignupApiError('No se pudo conectar con el servidor. Inténtalo nuevamente.', 0);
  }

  if (!response.ok) {
    let message = 'Ocurrió un error al crear la cuenta. Inténtalo nuevamente.';

    if (response.status === 409) {
      message = 'El correo o la identificación ya están registrados.';

      try {
        const errorData: unknown = await response.json();

        if (
          typeof errorData === 'object' &&
          errorData !== null &&
          'detail' in errorData &&
          typeof errorData.detail === 'string'
        ) {
          message = errorData.detail;
        }
      } catch {
        // Se conserva el mensaje de conflicto predeterminado.
      }
    } else if (response.status === 422) {
      message = 'Revisa los datos ingresados y vuelve a intentarlo.';
    }

    throw new SignupApiError(message, response.status);
  }

  return (await response.json()) as SignupResponse;
}
