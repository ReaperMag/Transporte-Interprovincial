import { LoginForm } from '../components/LoginForm';
import type { LoginFormProps } from '../types/auth.types';
import './LoginPage.css';

export function LoginPage({ onSubmit, isLoading = false, error = null }: LoginFormProps) {
  return (
    <main className="login-page">
      <section className="login-page__card" aria-labelledby="login-title">
        <header className="login-page__header">
          <h1 className="login-page__title" id="login-title">
            Iniciar sesión
          </h1>

          <p className="login-page__description">
            Ingresa tus credenciales para acceder al sistema.
          </p>
        </header>

        <LoginForm onSubmit={onSubmit} isLoading={isLoading} error={error} />
      </section>
    </main>
  );
}
