import { postAuth } from './authApi';

export function verifyEmail(email: string, code: string): Promise<string> {
  return postAuth('/verify-email', { email, code }, 'No fue posible verificar el correo.');
}

/** La API responde siempre el mismo mensaje, exista o no la cuenta. */
export function resendVerificationCode(email: string): Promise<string> {
  return postAuth('/verify-email/resend', { email }, 'No fue posible reenviar el código.');
}
