import { LoginForm } from '../components/LoginForm';
import type { LoginFormProps } from '../types/auth.types';

export function LoginPage({ onSubmit, isLoading = false, error = null }: LoginFormProps) {
  return (
    <main>
      <section aria-labelledby="login-title">
        <h1 id="login-title">Iniciar sesión</h1>

        <p>Ingresa tus credenciales para acceder al sistema.</p>

        <LoginForm onSubmit={onSubmit} isLoading={isLoading} error={error} />
      </section>
    </main>
  );
}
