import { useState } from 'react';
import type { FormEvent } from 'react';
import type { LoginCredentials, LoginFormProps } from '../types/auth.types';

export function LoginForm({ onSubmit, isLoading = false, error = null }: LoginFormProps) {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field: keyof LoginCredentials, value: string) => {
    setCredentials((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isLoading) return;

    await onSubmit({
      email: credentials.email.trim(),
      password: credentials.password,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="login-email">Correo electrónico</label>
        <input
          id="login-email"
          name="email"
          type="email"
          value={credentials.email}
          onChange={(event) => handleChange('email', event.target.value)}
          placeholder="Ingresa tu correo electrónico"
          autoComplete="username"
          required
          disabled={isLoading}
        />
      </div>

      <div>
        <label htmlFor="login-password">Contraseña</label>
        <input
          id="login-password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={credentials.password}
          onChange={(event) => handleChange('password', event.target.value)}
          placeholder="Ingresa tu contraseña"
          autoComplete="current-password"
          required
          disabled={isLoading}
        />

        <button
          type="button"
          onClick={() => setShowPassword((previous) => !previous)}
          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          disabled={isLoading}
        >
          {showPassword ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>

      {error && (
        <p role="alert" aria-live="polite">
          {error}
        </p>
      )}

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
