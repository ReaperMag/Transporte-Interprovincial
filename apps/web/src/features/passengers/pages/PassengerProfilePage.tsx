import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  getPassengerProfile,
  updatePassengerProfile,
  type PassengerCategory,
  type PassengerProfile,
  type PassengerProfileUpdate,
} from '../services/passenger.service';

import './PassengerProfilePage.css';

export function PassengerProfilePage() {
  const [profile, setProfile] = useState<PassengerProfile | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [category, setCategory] = useState<PassengerCategory>('regular');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function fillForm(data: PassengerProfile) {
    setFirstName(data.firstName ?? '');
    setLastName(data.lastName ?? '');
    setEmail(data.email);
    setPhone(data.phone ?? '');
    setBirthDate(data.birthDate ?? '');
    setCategory((data.category as PassengerCategory | null) ?? 'regular');
  }

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const data = await getPassengerProfile();

        if (active) {
          setProfile(data);
          fillForm(data);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil.');
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile || isSaving) {
      return;
    }

    setError(null);
    setSuccess(null);

    const changes: PassengerProfileUpdate = {};

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    // Solo agregar campos cuyo valor haya cambiado.
    if (normalizedFirstName !== (profile.firstName ?? '')) {
      changes.firstName = normalizedFirstName;
    }

    if (normalizedLastName !== (profile.lastName ?? '')) {
      changes.lastName = normalizedLastName;
    }

    if (normalizedEmail !== profile.email) {
      changes.email = normalizedEmail;
    }

    if (normalizedPhone !== (profile.phone ?? '')) {
      changes.phone = normalizedPhone || null;
    }

    if (birthDate !== (profile.birthDate ?? '')) {
      changes.birthDate = birthDate || null;
    }

    if (category !== profile.category) {
      changes.category = category;
    }

    if (Object.keys(changes).length === 0) {
      setSuccess('No hay cambios pendientes por guardar.');
      return;
    }

    if (!normalizedFirstName || !normalizedLastName) {
      setError('Los nombres y apellidos son obligatorios.');
      return;
    }

    setIsSaving(true);

    try {
      const updatedProfile = await updatePassengerProfile(changes);

      setProfile(updatedProfile);
      fillForm(updatedProfile);
      setSuccess('Tu perfil se actualizó correctamente.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p role="status">Cargando tu perfil...</p>;
  }

  if (!profile) {
    return <p role="alert">{error ?? 'No se encontró tu perfil.'}</p>;
  }

  if (!profile.hasPassengerProfile) {
    return (
      <section className="passenger-profile">
        <h1>Mi perfil</h1>
        <p role="alert">Tu cuenta todavía no tiene un perfil de pasajero vinculado.</p>
      </section>
    );
  }

  return (
    <section className="passenger-profile">
      <header className="passenger-profile__header">
        <Link to="/pasajero">← Volver al inicio</Link>
        <h1>Mi perfil</h1>
        <p>
          Consulta y actualiza tu información personal. Solo se guardarán los datos que modifiques.
        </p>
      </header>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="passenger-profile__card">
          <h2>Datos personales</h2>
          <p className="passenger-profile__description">
            Puedes modificar tu información excepto el documento de identidad.
          </p>

          <div className="passenger-profile__grid">
            <div className="passenger-profile__field">
              <label htmlFor="passenger-first-name">Nombres</label>
              <input
                id="passenger-first-name"
                type="text"
                value={firstName}
                maxLength={100}
                required
                onChange={(event) => {
                  setFirstName(event.target.value);
                  setSuccess(null);
                }}
              />
            </div>

            <div className="passenger-profile__field">
              <label htmlFor="passenger-last-name">Apellidos</label>
              <input
                id="passenger-last-name"
                type="text"
                value={lastName}
                maxLength={100}
                required
                onChange={(event) => {
                  setLastName(event.target.value);
                  setSuccess(null);
                }}
              />
            </div>

            <div className="passenger-profile__field">
              <label htmlFor="passenger-id-number">Documento de identidad</label>
              <input
                id="passenger-id-number"
                type="text"
                value={profile.idNumber ?? ''}
                readOnly
                aria-describedby="passenger-id-help"
              />
              <small id="passenger-id-help">Este dato no se puede modificar.</small>
            </div>

            <div className="passenger-profile__field">
              <label htmlFor="passenger-email">Correo electrónico</label>
              <input
                id="passenger-email"
                type="email"
                value={email}
                maxLength={150}
                required
                onChange={(event) => {
                  setEmail(event.target.value);
                  setSuccess(null);
                }}
              />
            </div>

            <div className="passenger-profile__field">
              <label htmlFor="passenger-phone">Teléfono</label>
              <input
                id="passenger-phone"
                type="tel"
                value={phone}
                maxLength={20}
                placeholder="Ingresa tu teléfono"
                onChange={(event) => {
                  setPhone(event.target.value);
                  setSuccess(null);
                }}
              />
            </div>

            <div className="passenger-profile__field">
              <label htmlFor="passenger-birth-date">Fecha de nacimiento</label>
              <input
                id="passenger-birth-date"
                type="date"
                value={birthDate}
                max={new Date().toLocaleDateString('en-CA')}
                onChange={(event) => {
                  setBirthDate(event.target.value);
                  setSuccess(null);
                }}
              />
            </div>

            <div className="passenger-profile__field">
              <label htmlFor="passenger-category">Categoría</label>
              <select
                id="passenger-category"
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as PassengerCategory);
                  setSuccess(null);
                }}
              >
                <option value="regular">Regular</option>
                <option value="minor">Menor de edad</option>
                <option value="senior">Tercera edad</option>
                <option value="disability">Discapacidad</option>
              </select>
              <small>Los descuentos requieren verificar la categoría.</small>
            </div>
          </div>
        </div>

        <div className="passenger-profile__card">
          <h2>Guardar información</h2>
          <p className="passenger-profile__description">
            No necesitas modificar todos los campos. Solo se enviarán los valores que hayan
            cambiado.
          </p>

          {error && (
            <p className="passenger-profile__error" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="passenger-profile__success" role="status">
              {success}
            </p>
          )}

          <button className="passenger-profile__save" type="submit" disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </section>
  );
}
