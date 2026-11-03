export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

interface MessageResponse {
  message: string;
}

const STATUS_MESSAGES: Record<number, string> = {
  403: 'La API rechazó el origen del frontend.',
  422: 'Revisa los datos ingresados y vuelve a intentarlo.',
  429: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
};

/** Lee el mensaje de error que envía FastAPI en "detail". */
export async function readApiError(response: Response, fallback: string): Promise<AuthApiError> {
  let message = STATUS_MESSAGES[response.status] ?? fallback;
  let code: string | undefined;

  try {
    const data: unknown = await response.json();

    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const detail = data.detail;

      if (typeof detail === 'string' && response.status !== 422) {
        message = detail;
      } else if (typeof detail === 'object' && detail !== null) {
        if ('message' in detail && typeof detail.message === 'string') {
          message = detail.message;
        }
        if ('code' in detail && typeof detail.code === 'string') {
          code = detail.code;
        }
      }
    }
  } catch {
    // Se conserva el mensaje predeterminado.
  }

  return new AuthApiError(message, response.status, code);
}

/** Envía un POST JSON a la API de autenticación y devuelve su mensaje. */
export async function postAuth(path: string, body: unknown, fallback: string): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`/api/v1/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError('No se pudo conectar con el servidor. Inténtalo nuevamente.', 0);
  }

  if (!response.ok) {
    throw await readApiError(response, fallback);
  }

  return ((await response.json()) as MessageResponse).message;
}
