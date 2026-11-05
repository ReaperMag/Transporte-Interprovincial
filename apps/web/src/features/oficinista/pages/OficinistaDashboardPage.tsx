import { useEffect, useState } from 'react';
import { getOficinistaInfo } from '../services/oficinista.service';
import type { OficinistaInfo } from '../types/oficinista.types';
import './OficinistaDashboardPage.css';

export function OficinistaDashboardPage() {
  const [profile, setProfile] = useState<OficinistaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOficinistaInfo()
      .then((result) => {
        if (active) {
          setProfile(result);
          if (!result) setError('No se encontró el perfil del oficinista.');
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar la información del oficinista.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="oficinista-dashboard" aria-labelledby="oficinista-profile-title">
      <header className="oficinista-dashboard__header">
        <p className="oficinista-dashboard__eyebrow">Cuenta personal</p>
        <h1 className="oficinista-dashboard__title" id="oficinista-profile-title">
          Perfil del oficinista
        </h1>
        <p className="oficinista-dashboard__oficinista-name">
          Consulta tus datos y la cooperativa a la que perteneces.
        </p>
      </header>

      {loading && <p role="status">Cargando perfil...</p>}
      {error && (
        <p className="oficinista-dashboard__error" role="alert">
          {error}
        </p>
      )}

      {profile && (
        <section className="oficinista-dashboard__section" aria-label="Datos del oficinista">
          <dl className="oficinista-dashboard__profile">
            <div>
              <dt>Nombres y apellidos</dt>
              <dd>{profile.fullName}</dd>
            </div>
            <div>
              <dt>Correo electrónico</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>Cédula</dt>
              <dd>{profile.idNumber}</dd>
            </div>
            <div>
              <dt>Teléfono</dt>
              <dd>{profile.phone || 'No registrado'}</dd>
            </div>
            <div>
              <dt>Cargo</dt>
              <dd>Oficinista</dd>
            </div>
            <div>
              <dt>Cooperativa</dt>
              <dd>{profile.cooperativeName}</dd>
            </div>
            <div>
              <dt>RUC de la cooperativa</dt>
              <dd>{profile.cooperativeRuc}</dd>
            </div>
            <div>
              <dt>Dirección</dt>
              <dd>{profile.cooperativeAddress || 'No registrada'}</dd>
            </div>
            <div>
              <dt>Teléfono de la cooperativa</dt>
              <dd>{profile.cooperativePhone || 'No registrado'}</dd>
            </div>
            <div>
              <dt>Correo de la cooperativa</dt>
              <dd>{profile.cooperativeEmail || 'No registrado'}</dd>
            </div>
            <div>
              <dt>Contacto de soporte</dt>
              <dd>
                {[profile.cooperativeSupportPhone, profile.cooperativeSupportEmail]
                  .filter(Boolean)
                  .join(' · ') || 'No registrado'}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </section>
  );
}
