import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { AuthPageLayout } from '../components/AuthPageLayout';
import { RESEND_COOLDOWN_SECONDS, useCooldown } from '../hooks/useCooldown';
import { AuthApiError } from '../services/authApi';
import { resendVerificationCode, verifyEmail } from '../services/emailVerification.service';

export interface VerifyEmailLocationState {
  /** signup: el código se acaba de enviar. login: la cuenta aún no está verificada. */
  reason?: 'signup' | 'login';
}

const INITIAL_NOTICES = {
  signup: 'Te enviamos un código de 6 dígitos a tu correo. Revisa también la carpeta de spam.',
  login:
    'Tu cuenta aún no está verificada. Ingresa el código que te enviamos o solicita uno nuevo.',
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthApiError ? error.message : fallback;
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const reason = (useLocation().state as VerifyEmailLocationState | null)?.reason;

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(reason ? INITIAL_NOTICES[reason] : null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const cooldown = useCooldown(reason === 'signup' ? RESEND_COOLDOWN_SECONDS : 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    if (code.length !== 6) {
      setError('El código debe tener 6 dígitos.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setSuccessMessage(await verifyEmail(email.trim(), code));
    } catch (err) {
      setError(errorMessage(err, 'Ocurrió un error al verificar el correo.'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    if (isResending || cooldown.isCoolingDown) return;

    if (!email.trim()) {
      setError('Ingresa tu correo electrónico para reenviar el código.');
      return;
    }

    setIsResending(true);
    setError(null);

    try {
      setNotice(await resendVerificationCode(email.trim()));
      setCode('');
      cooldown.start();
    } catch (err) {
      setError(errorMessage(err, 'Ocurrió un error al reenviar el código.'));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthPageLayout
      titleId="verify-email-title"
      title="Verifica tu correo"
      description="Ingresa el código de 6 dígitos que enviamos a tu correo para activar tu cuenta."
      kicker="Cuenta de pasajero"
      heading="Un último paso para empezar a viajar."
    >
      {successMessage ? (
        <div className="login-form">
          <p className="account-recovery__success" role="status">
            {successMessage}
          </p>
          <Link className="account-recovery__button-link" to="/login" replace>
            Iniciar sesión
          </Link>
        </div>
      ) : (
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {notice && (
            <p className="account-recovery__notice" role="status">
              {notice}
            </p>
          )}

          <div className="login-form__field">
            <label className="login-form__label" htmlFor="verify-email">
              Correo electrónico
            </label>
            <input
              className="login-form__input"
              id="verify-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Ingresa tu correo electrónico"
              autoComplete="email"
              required
              disabled={isLoading}
            />
          </div>

          <div className="login-form__field">
            <label className="login-form__label" htmlFor="verify-code">
              Código de verificación
            </label>
            <input
              className="login-form__input account-recovery__code"
              id="verify-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(onlyDigits(event.target.value))}
              placeholder="000000"
              maxLength={6}
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <p className="login-form__error" role="alert">
              {error}
            </p>
          )}

          <button className="login-form__submit" type="submit" disabled={isLoading}>
            {isLoading ? 'Verificando...' : 'Verificar correo'}
          </button>

          <button
            className="account-recovery__secondary"
            type="button"
            onClick={handleResend}
            disabled={isResending || cooldown.isCoolingDown}
          >
            {isResending
              ? 'Enviando...'
              : cooldown.isCoolingDown
                ? `Reenviar código en ${cooldown.secondsLeft} s`
                : 'Reenviar código'}
          </button>

          <p className="account-recovery__links">
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        </form>
      )}
    </AuthPageLayout>
  );
}
