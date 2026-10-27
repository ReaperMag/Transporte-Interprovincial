import { useEffect, useState } from 'react';
import {
  getAuthenticatedCooperative,
  type CooperativeIdentity,
} from '../services/cooperative.service';
import './CooperativeDashboardPage.css';

export function CooperativeDashboardPage() {
  const [cooperative, setCooperative] = useState<CooperativeIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadCooperative() {
      try {
        const identity = await getAuthenticatedCooperative();
        if (active) {
          setCooperative(identity);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible obtener la información de la cooperativa.',
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadCooperative();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="cooperative-dashboard" aria-labelledby="cooperative-dashboard-title">
      <header className="cooperative-dashboard__header">
        <p className="cooperative-dashboard__eyebrow">Área de trabajo</p>
        <h2 id="cooperative-dashboard-title" className="cooperative-dashboard__title">
          Bienvenido
        </h2>
        <p className="cooperative-dashboard__description">
          Aquí puedes verificar la identidad asociada a la sesión actual.
        </p>
      </header>

      <section
        className="cooperative-dashboard__identity"
        aria-labelledby="cooperative-identity-title"
        aria-live="polite"
      >
        <h3 id="cooperative-identity-title">Cooperativa autenticada</h3>
        {isLoading && <p role="status">Cargando información de la cooperativa...</p>}
        {error && (
          <p className="cooperative-dashboard__error" role="alert">
            {error}
          </p>
        )}
        {cooperative && (
          <dl>
            <div>
              <dt>Nombre</dt>
              <dd>{cooperative.name}</dd>
            </div>
            <div>
              <dt>RUC</dt>
              <dd>{cooperative.ruc}</dd>
            </div>
          </dl>
        )}
      </section>

      <p className="cooperative-dashboard__notice">
        Configuración, grupos y buses estarán disponibles en próximas etapas.
      </p>
    </section>
  );
}
