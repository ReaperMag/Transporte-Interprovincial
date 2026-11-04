import { LoginForm } from '../components/LoginForm';
import type { LoginFormProps } from '../types/auth.types';
import './LoginPage.css';

export function LoginPage(props: LoginFormProps) {
  return (
    <main className="login-page">
      <aside className="login-page__intro" aria-hidden="true">
        <p className="login-page__brand">TRANSPORTE INTERPROVINCIAL</p>
        <p className="login-page__intro-kicker">Plataforma de viajes</p>
        <h2>Boletos, flota y salidas en un solo sistema.</h2>
        <div className="login-page__intro-tags"><span>Compra en línea</span><span>Venta en oficina</span><span>Gestión de flota</span></div>
      </aside>
      <section className="login-page__card" aria-labelledby="login-title">
        <header className="login-page__header">
          <h1 className="login-page__title" id="login-title">
            Iniciar sesión
          </h1>

          <p className="login-page__description">
            Ingresa tus credenciales para acceder al sistema.
          </p>
        </header>

        <LoginForm {...props} />
      </section>
    </main>
  );
}
