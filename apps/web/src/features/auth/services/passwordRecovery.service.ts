import { postAuth } from './authApi';

export interface ResetPasswordValues {
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
}

/** La API responde siempre el mismo mensaje, exista o no la cuenta. */
export function requestPasswordReset(email: string): Promise<string> {
  return postAuth('/password/forgot', { email }, 'No fue posible enviar el código.');
}

export function resetPassword(values: ResetPasswordValues): Promise<string> {
  return postAuth('/password/reset', values, 'No fue posible cambiar la contraseña.');
}
