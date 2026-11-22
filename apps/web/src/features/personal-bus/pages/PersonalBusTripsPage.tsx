import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPersonalBusProfile, listMyTrips } from '../services/personalBus.service';
import type { PersonalBusProfile, TripSummary } from '../types/personalBus.types';
import { TRIP_STATUS_LABELS, formatDateTime } from '../utils/format';
import '../../oficinista/pages/OficinistaOperationsPage.css';
import './PersonalBusPages.css';

export function PersonalBusTripsPage() {
  const [profile, setProfile] = useState<PersonalBusProfile | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getPersonalBusProfile()
      .then(async (nextProfile) => {
        const nextTrips = nextProfile.assignedBus ? await listMyTrips() : [];
        if (!active) return;
        setProfile(nextProfile);
        setTrips(nextTrips);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'No fue posible cargar los viajes.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  return (
    <section className="oficinista-operations personal-bus">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">Personal del bus</p>
        <h1>{profile ? `Hola, ${profile.firstName}` : 'Mis viajes'}</h1>
        <p>
          {profile?.assignedBus
            ? `Bus ${profile.assignedBus.number} · ${profile.assignedBus.plate}`
            : 'Aquí aparecen los viajes del bus que tienes asignado.'}
        </p>
      </header>

      {error && (
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
      )}

      <section className="oficinista-operations__card">
        <div className="oficinista-operations__card-heading">
          <div>
            <h2>Próximos viajes</h2>
            {!loading && (
              <p>
                {trips.length} viaje{trips.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <button
            type="button"
            className="oficinista-operations__button--secondary"
            onClick={reload}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>

        {loading ? (
          <p role="status">Cargando viajes...</p>
        ) : !profile?.assignedBus ? (
          <p className="oficinista-operations__empty">
            Todavía no tienes un bus asignado. Pide a la cooperativa que te asigne uno.
          </p>
        ) : trips.length === 0 ? (
          <p className="oficinista-operations__empty">Tu bus no tiene viajes programados.</p>
        ) : (
          <div className="oficinista-operations__list">
            {trips.map((trip) => (
              <Link className="personal-bus__trip-link" key={trip.id} to={`../viajes/${trip.id}`}>
                <article className="oficinista-operations__item">
                  <div className="oficinista-operations__item-heading">
                    <div>
                      <h3>
                        {trip.originCityName} - {trip.destinationCityName}
                      </h3>
                      <p>{formatDateTime(trip.departureAt)}</p>
                    </div>
                    <span className={`personal-bus__status personal-bus__status--${trip.status}`}>
                      {TRIP_STATUS_LABELS[trip.status]}
                    </span>
                  </div>
                  <p>
                    {trip.ticketsSold} boleto{trip.ticketsSold === 1 ? '' : 's'} vendido
                    {trip.ticketsSold === 1 ? '' : 's'} · {trip.passengersBoarded} abordaron
                  </p>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
