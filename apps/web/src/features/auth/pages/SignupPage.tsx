import { Link } from 'react-router-dom';
import { SignupForm } from '../components/SignupForm';
import type { SignupFormProps } from '../types/signup.types';
import './SignupPage.css';

export function SignupPage(props: SignupFormProps) {
  return (
    <main className="signup-page">
      <section className="signup-page__card" aria-labelledby="signup-page-title">
        <header className="signup-page__header">
          <h1 id="signup-page-title" className="signup-page__title">
            Crear cuenta
          </h1>

          <p className="signup-page__description">
            Completa tus datos para registrarte en Transporte Interprovincial.
          </p>
        </header>

        <SignupForm {...props} />

        <footer className="signup-page__footer">
          <p>
            ¿Ya tienes una cuenta?{' '}
            <Link to="/login" className="signup-page__link">
              Iniciar sesión
            </Link>
          </p>
        </footer>
      </section>
    </main>
  );
}
