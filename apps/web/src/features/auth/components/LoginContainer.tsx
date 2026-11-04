import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import type { VerifyEmailLocationState } from '../pages/VerifyEmailPage';
import { AuthApiError } from '../services/authApi';
import { EMAIL_NOT_VERIFIED, loginAccount } from '../services/login.service';
import type { LoginCredentials } from '../types/auth.types';
import { useAuth } from '../context/useAuth';
export function LoginContainer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshSession } = useAuth();
  const navigate = useNavigate();
  async function handleLogin(credentials: LoginCredentials) {
    setIsLoading(true);
    setError(null);

    try {
      const account = await loginAccount(credentials);
      await refreshSession();
      navigate(
        account.accountType === 'super_admin'
          ? '/admin/cooperativas'
          : account.accountType === 'cooperative'
            ? '/cooperativa/panel'
            : '/pasajero',
        { replace: true },
      );
    } catch (err) {
      if (err instanceof AuthApiError && err.code === EMAIL_NOT_VERIFIED) {
        const state: VerifyEmailLocationState = { reason: 'login' };
        navigate(`/verificar-correo?email=${encodeURIComponent(credentials.email)}`, { state });
        return;
      }
      setError(err instanceof Error ? err.message : 'Ocurrió un error al iniciar sesión.');
    } finally {
      setIsLoading(false);
    }
  }

  return <LoginPage onSubmit={handleLogin} isLoading={isLoading} error={error} />;
}
