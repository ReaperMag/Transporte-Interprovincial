import { useState } from 'react';
import { LoginPage } from '../pages/LoginPage';
import { loginPassenger } from '../services/login.service';
import type { LoginCredentials } from '../types/auth.types';

export function LoginContainer() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(credentials: LoginCredentials) {
    setIsLoading(true);
    setError(null);

    try {
      const account = await loginPassenger(credentials);

      console.log('Inicio de sesión exitoso:', account.email);

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
