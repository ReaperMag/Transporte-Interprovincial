import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { emailError } from '../../../shared/utils/validation';
import { AuthPageLayout } from '../components/AuthPageLayout';
import { AuthApiError } from '../services/authApi';
import { requestPasswordReset } from '../services/passwordRecovery.service';
import type { ResetPasswordLocationState } from './ResetPasswordPage';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const invalidEmail = emailError(email);
    if (invalidEmail) {
      setError(invalidEmail);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setSentMessage(await requestPasswordReset(email.trim()));
    } catch (err) {
      setError(
        err instanceof AuthApiError ? err.message : 'Ocurrió un error al solicitar el código.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  const resetState: ResetPasswordLocationState = { codeSent: true };

  return (
    <AuthPageLayout
      titleId="forgot-password-title"
      title="¿Olvidaste tu contraseña?"
      description="Ingresa el correo de tu cuenta y te enviaremos un código para crear una nueva contraseña."
      kicker="Recuperar acceso"
      heading="Vuelve a tu cuenta en pocos pasos."
    >
      {sentMessage ? (
        <div className="login-form">
          <p className="account-recovery__success" role="status">
            {sentMessage}
          </p>
          <Link
            className="account-recovery__button-link"
            to={`/restablecer-contrasena?email=${encodeURIComponent(email.trim())}`}
            state={resetState}
          >
            Ingresar el código
          </Link>
          <p className="account-recovery__links">
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        </div>
      ) : (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-form__field">
            <label className="login-form__label" htmlFor="forgot-email">
              Correo electrónico
            </label>
            <input
              className="login-form__input"
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Ingresa tu correo electrónico"
              autoComplete="email"
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
            {isLoading ? 'Enviando...' : 'Enviar código'}
          </button>

          <p className="account-recovery__links">
            <Link to="/login">Volver a iniciar sesión</Link>
          </p>
        </form>
      )}
    </AuthPageLayout>
  );
}
