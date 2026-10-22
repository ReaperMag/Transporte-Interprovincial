import { useState } from 'react';
import type { FormEvent } from 'react';
import type { LoginCredentials, LoginFormProps } from '../types/auth.types';
import './LoginForm.css';
import { Link } from 'react-router-dom';
export function LoginForm(props: LoginFormProps) {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });

  const [showPassword, setShowPassword] = useState(false);

  const isPreview = props.mode === 'preview';
  const isLoading = !isPreview && (props.isLoading ?? false);
  const error = !isPreview ? props.error : null;

  const handleChange = (field: keyof LoginCredentials, value: string) => {
    setCredentials((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (props.mode === 'preview' || isLoading) {
      return;
    }

    await props.onSubmit({
      email: credentials.email.trim(),
      password: credentials.password,
    });
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-form__field">
        <label className="login-form__label" htmlFor="login-email">
          Correo electrónico
        </label>

        <input
          className="login-form__input"
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

      <div className="login-form__field">
        <label className="login-form__label" htmlFor="login-password">
          Contraseña
        </label>

        <div className="login-form__password">
          <input
            className="login-form__input"
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
            className="login-form__toggle"
            type="button"
            onClick={() => setShowPassword((previous) => !previous)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={showPassword}
            disabled={isLoading}
          >
            {showPassword ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>

      {error && (
        <p className="login-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="login-form__submit" type="submit" disabled={isPreview || isLoading}>
        {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
      </button>
      <p className="login-form__register">
  ¿No tienes una cuenta? <Link to="/signup">Regístrate aquí</Link>
</p>
    </form>
  );
}
