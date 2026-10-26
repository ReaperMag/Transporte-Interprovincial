import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPassengerProfile, type PassengerProfile } from '../services/passenger.service';
import './PassengerDashboardPage.css';

export function PassengerDashboardPage() {
  const [profile, setProfile] = useState<PassengerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const data = await getPassengerProfile();

        if (active) {
          setProfile(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Ocurrió un error al cargar el perfil.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return <p role="status">Cargando información del pasajero...</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!profile) {
    return <p>No se encontró información del pasajero.</p>;
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <section className="passenger-dashboard">
      <header className="passenger-dashboard__header">
        <p className="passenger-dashboard__eyebrow">TRANSPORTE INTERPROVINCIAL</p>
        <h1>¡Bienvenido{fullName ? `, ${fullName}` : ''}!</h1>
        <p>Desde aquí podrás acceder a los servicios disponibles para pasajeros.</p>
      </header>

      <div className="passenger-dashboard__grid">
        <article className="passenger-dashboard__card">
          <h2>Mi información</h2>

          <dl>
            <dt>Correo electrónico</dt>
            <dd>{profile.email}</dd>

            <dt>Documento de identidad</dt>
            <dd>{profile.idNumber ?? 'No registrado'}</dd>

            <dt>Teléfono</dt>
            <dd>{profile.phone ?? 'No registrado'}</dd>

            <dt>Categoría</dt>
            <dd>{profile.category ?? 'No registrada'}</dd>
          </dl>
        </article>

        <article className="passenger-dashboard__card">
          <h2>Seleccionar asientos</h2>
          <p>Explora los diseños de buses y selecciona los asientos que prefieras.</p>
          <p className="passenger-dashboard__notice">
            Esta funcionalidad todavía es una demostración y no registra compras.
          </p>

          <Link className="passenger-dashboard__action" to="/pasajero/asientos">
            Ver selección de asientos
          </Link>
        </article>
      </div>
    </section>
  );
}
