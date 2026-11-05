import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { emailError, onlyDigits } from '../../../shared/utils/validation';
import { AuthPageLayout } from '../components/AuthPageLayout';
import { RESEND_COOLDOWN_SECONDS, useCooldown } from '../hooks/useCooldown';
import { AuthApiError } from '../services/authApi';
import { requestPasswordReset, resetPassword } from '../services/passwordRecovery.service';

export interface ResetPasswordLocationState {
  /** El código se acaba de solicitar en "¿Olvidaste tu contraseña?". */
  codeSent?: boolean;
}

// Misma política de contraseñas que el registro.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof AuthApiError ? error.message : fallback;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const codeSent = (useLocation().state as ResetPasswordLocationState | null)?.codeSent === true;

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const cooldown = useCooldown(codeSent ? RESEND_COOLDOWN_SECONDS : 0);

  function validate(): string | null {
    const invalidEmail = emailError(email);
    if (invalidEmail) return invalidEmail;
    if (code.length !== 6) return 'El código debe tener 6 dígitos.';
    if (password.length < PASSWORD_MIN_LENGTH) {
      return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`;
    }
    if (password !== confirmPassword) return 'Las contraseñas no coinciden.';
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setSuccessMessage(
        await resetPassword({ email: email.trim(), code, password, confirmPassword }),
      );
    } catch (err) {
      setError(errorMessage(err, 'Ocurrió un error al cambiar la contraseña.'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    if (isResending || cooldown.isCoolingDown) return;

    if (!email.trim()) {
      setError('Ingresa tu correo electrónico para solicitar otro código.');
      return;
    }

    setIsResending(true);
    setError(null);

    try {
      setNotice(await requestPasswordReset(email.trim()));
      setCode('');
      cooldown.start();
    } catch (err) {
      setError(errorMessage(err, 'Ocurrió un error al solicitar otro código.'));
    } finally {
      setIsResending(false);
    }
  }

  return (
    <AuthPageLayout
      titleId="reset-password-title"
      title="Nueva contraseña"
      description="Ingresa el código que enviamos a tu correo y elige una nueva contraseña."
      kicker="Recuperar acceso"
      heading="Vuelve a tu cuenta en pocos pasos."
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
            <label className="login-form__label" htmlFor="reset-email">
              Correo electrónico
            </label>
            <input
              className="login-form__input"
              id="reset-email"
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
            <label className="login-form__label" htmlFor="reset-code">
              Código recibido
            </label>
            <input
              className="login-form__input account-recovery__code"
              id="reset-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(onlyDigits(event.target.value, 6))}
              placeholder="000000"
              maxLength={6}
              required
              disabled={isLoading}
            />
          </div>

          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reset-password">
              Nueva contraseña
            </label>
            <div className="login-form__password">
              <input
                className="login-form__input"
                id="reset-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX_LENGTH}
                required
                disabled={isLoading}
              />
              <button
                className="login-form__toggle"
                type="button"
                onClick={() => setShowPassword((previous) => !previous)}
                aria-label={showPassword ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                aria-pressed={showPassword}
                disabled={isLoading}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          <div className="login-form__field">
            <label className="login-form__label" htmlFor="reset-confirm-password">
              Confirmar contraseña
            </label>
            <input
              className="login-form__input"
              id="reset-confirm-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repite la nueva contraseña"
              autoComplete="new-password"
              maxLength={PASSWORD_MAX_LENGTH}
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
            {isLoading ? 'Guardando...' : 'Cambiar contraseña'}
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
                ? `Solicitar otro código en ${cooldown.secondsLeft} s`
                : 'Solicitar otro código'}
          </button>

          <p className="account-recovery__links">
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        </form>
      )}
    </AuthPageLayout>
  );
}
