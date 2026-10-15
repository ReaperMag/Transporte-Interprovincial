import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  return (
    <main>
      <section>
        <h1>Iniciar sesión</h1>
        <p>Ingresa tus credenciales para acceder al sistema.</p>

        <LoginForm />
      </section>
    </main>
  );
}
