import { useState } from 'react';
import { LoginPage } from '../pages/LoginPage';
import { loginPassenger } from '../services/login.service';
import type { LoginCredentials } from '../types/auth.types';
import { useAuth } from '../context/useAuth';
export function LoginContainer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshSession } = useAuth();
  async function handleLogin(credentials: LoginCredentials) {
    setIsLoading(true);
    setError(null);

    try {
      await loginPassenger(credentials);
      await refreshSession();
      // Temporalmente verificamos el inicio de sesión.
      // La navegación dependerá de las rutas privadas existentes.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al iniciar sesión.');
    } finally {
      setIsLoading(false);
    }
  }

  return <LoginPage onSubmit={handleLogin} isLoading={isLoading} error={error} />;
}
