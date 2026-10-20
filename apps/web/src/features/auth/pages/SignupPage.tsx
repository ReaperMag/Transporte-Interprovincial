import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { SignupForm } from '../components/SignupForm';
import { registerPassenger, SignupApiError } from '../services/signup.service';
import type { SignupFormValues } from '../types/signup.types';

import './SignupPage.css';

export function SignupPage() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup(values: SignupFormValues): Promise<void> {
    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await registerPassenger(values);

      // Redirige al Login únicamente si el registro fue exitoso.
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      if (err instanceof SignupApiError) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado. Inténtalo nuevamente.');
      }
    } finally {
      setIsLoading(false);
    }
  }

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

        <SignupForm
          mode="interactive"
          onSubmit={handleSignup}
          isLoading={isLoading}
          error={error}
        />

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
