import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { loginAccount } from '../services/login.service';
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
            ? '/cooperativa/pendiente'
            : '/pasajero',
        { replace: true },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al iniciar sesión.');
    } finally {
      setIsLoading(false);
    }
  }

  return <LoginPage onSubmit={handleLogin} isLoading={isLoading} error={error} />;
}
