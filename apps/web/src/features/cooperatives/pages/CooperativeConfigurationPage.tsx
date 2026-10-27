import { useEffect, useState, type FormEvent } from 'react';
import {
  getAuthenticatedCooperativeProfile,
  updateAuthenticatedCooperativeProfile,
  type CooperativeProfile,
} from '../services/cooperative.service';
import './CooperativeConfigurationPage.css';

type EditableProfile = {
  [Field in keyof Omit<CooperativeProfile, 'id' | 'name' | 'ruc'>]: string;
};
type NullableEditableProfile = Omit<CooperativeProfile, 'id' | 'name' | 'ruc'>;

const emptyProfile: EditableProfile = {
  address: '',
  phone: '',
  email: '',
  logoUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#0b1f3a',
  facebookUrl: '',
  instagramUrl: '',
  tiktokUrl: '',
  websiteUrl: '',
  description: '',
};

function toEditableProfile(profile: CooperativeProfile): EditableProfile {
  return {
    address: profile.address ?? '',
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    logoUrl: profile.logoUrl ?? '',
    primaryColor: profile.primaryColor ?? emptyProfile.primaryColor,
    secondaryColor: profile.secondaryColor ?? emptyProfile.secondaryColor,
    facebookUrl: profile.facebookUrl ?? '',
    instagramUrl: profile.instagramUrl ?? '',
    tiktokUrl: profile.tiktokUrl ?? '',
    websiteUrl: profile.websiteUrl ?? '',
    description: profile.description ?? '',
  };
}

function toNullableProfile(profile: EditableProfile): NullableEditableProfile {
  return {
    address: profile.address.trim() || null,
    phone: profile.phone.trim() || null,
    email: profile.email.trim() || null,
    logoUrl: profile.logoUrl.trim() || null,
    primaryColor: profile.primaryColor,
    secondaryColor: profile.secondaryColor,
    facebookUrl: profile.facebookUrl.trim() || null,
    instagramUrl: profile.instagramUrl.trim() || null,
    tiktokUrl: profile.tiktokUrl.trim() || null,
    websiteUrl: profile.websiteUrl.trim() || null,
    description: profile.description.trim() || null,
  } satisfies NullableEditableProfile;
}

export function CooperativeConfigurationPage() {
  const [identity, setIdentity] = useState<Pick<CooperativeProfile, 'name' | 'ruc'> | null>(null);
  const [profile, setProfile] = useState<EditableProfile>(emptyProfile);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const result = await getAuthenticatedCooperativeProfile();
        if (active) {
          setIdentity({ name: result.name, ruc: result.ruc });
          setProfile(toEditableProfile(result));
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible obtener la configuración de la cooperativa.',
          );
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

  const updateField = (field: keyof EditableProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setError(null);
    setSuccess(null);
    if (field === 'logoUrl') {
      setLogoFailed(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const saved = await updateAuthenticatedCooperativeProfile(toNullableProfile(profile));
      setProfile(toEditableProfile(saved));
      setSuccess('La configuración se guardó correctamente.');
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'No fue posible guardar la configuración.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      className="cooperative-configuration"
      aria-labelledby="cooperative-configuration-title"
    >
      <header className="cooperative-configuration__header">
        <p className="cooperative-configuration__eyebrow">Perfil de la organización</p>
        <h2 id="cooperative-configuration-title">Configuración</h2>
        <p>Administra los datos de contacto y la identidad visual de tu cooperativa.</p>
      </header>

      {isLoading ? (
        <p className="cooperative-configuration__status" role="status">
          Cargando configuración...
        </p>
      ) : (
        <>
          {error && (
            <p
              className="cooperative-configuration__message cooperative-configuration__message--error"
              role="alert"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              className="cooperative-configuration__message cooperative-configuration__message--success"
              role="status"
            >
              {success}
            </p>
          )}

          <div className="cooperative-configuration__grid">
            <form className="cooperative-configuration__form" onSubmit={handleSubmit}>
              <fieldset disabled={isSaving}>
                <legend>Información de la cooperativa</legend>
                <div className="cooperative-configuration__identity">
                  <label>
                    Nombre oficial
                    <input value={identity?.name ?? ''} readOnly />
                  </label>
                  <label>
                    Identificador (RUC)
                    <input value={identity?.ruc ?? ''} readOnly />
                  </label>
                </div>
              </fieldset>

              <fieldset disabled={isSaving}>
                <legend>Datos editables</legend>
                <div className="cooperative-configuration__fields">
                  <label>
                    Teléfono de contacto
                    <input
                      type="tel"
                      autoComplete="tel"
                      maxLength={20}
                      pattern="[+]?[0-9][0-9 ().-]{5,19}"
                      value={profile.phone}
                      onChange={(event) => updateField('phone', event.target.value)}
                    />
                  </label>
                  <label>
                    Correo de contacto
                    <input
                      type="email"
                      autoComplete="email"
                      maxLength={150}
                      value={profile.email}
                      onChange={(event) => updateField('email', event.target.value)}
                    />
                  </label>
                  <label className="cooperative-configuration__field--full">
                    Dirección
                    <input
                      autoComplete="street-address"
                      maxLength={255}
                      value={profile.address}
                      onChange={(event) => updateField('address', event.target.value)}
                    />
                  </label>
                  <label className="cooperative-configuration__field--full">
                    Logo (URL de imagen HTTPS o HTTP)
                    <input
                      type="url"
                      maxLength={500}
                      placeholder="https://ejemplo.com/logo.png"
                      value={profile.logoUrl}
                      onChange={(event) => updateField('logoUrl', event.target.value)}
                    />
                  </label>
                  <label>
                    Facebook
                    <input
                      type="url"
                      maxLength={500}
                      placeholder="https://facebook.com/..."
                      value={profile.facebookUrl}
                      onChange={(event) => updateField('facebookUrl', event.target.value)}
                    />
                  </label>
                  <label>
                    Instagram
                    <input
                      type="url"
                      maxLength={500}
                      placeholder="https://instagram.com/..."
                      value={profile.instagramUrl}
                      onChange={(event) => updateField('instagramUrl', event.target.value)}
                    />
                  </label>
                  <label>
                    TikTok
                    <input
                      type="url"
                      maxLength={500}
                      placeholder="https://tiktok.com/@..."
                      value={profile.tiktokUrl}
                      onChange={(event) => updateField('tiktokUrl', event.target.value)}
                    />
                  </label>
                  <label>
                    Sitio web
                    <input
                      type="url"
                      maxLength={500}
                      placeholder="https://ejemplo.com"
                      value={profile.websiteUrl}
                      onChange={(event) => updateField('websiteUrl', event.target.value)}
                    />
                  </label>
                  <label className="cooperative-configuration__field--full">
                    Descripción
                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={profile.description}
                      onChange={(event) => updateField('description', event.target.value)}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset disabled={isSaving}>
                <legend>Colores de identificación</legend>
                <div className="cooperative-configuration__colors">
                  <label>
                    Color principal
                    <span>
                      <input
                        type="color"
                        value={profile.primaryColor}
                        onChange={(event) => updateField('primaryColor', event.target.value)}
                      />
                      <code>{profile.primaryColor}</code>
                    </span>
                  </label>
                  <label>
                    Color secundario
                    <span>
                      <input
                        type="color"
                        value={profile.secondaryColor}
                        onChange={(event) => updateField('secondaryColor', event.target.value)}
                      />
                      <code>{profile.secondaryColor}</code>
                    </span>
                  </label>
                </div>
              </fieldset>

              <button className="cooperative-configuration__save" type="submit" disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </form>

            <aside className="cooperative-configuration__preview" aria-label="Vista previa">
              <h3>Vista previa</h3>
              <div className="cooperative-configuration__logo">
                {profile.logoUrl && !logoFailed ? (
                  <img
                    src={profile.logoUrl}
                    alt={`Logo de ${identity?.name ?? 'la cooperativa'}`}
                    onError={() => setLogoFailed(true)}
                  />
                ) : (
                  <span>{logoFailed ? 'No se pudo cargar el logo' : 'Sin logo configurado'}</span>
                )}
              </div>
              <h4>{identity?.name}</h4>
              <p>{profile.description || 'La descripción de la cooperativa aparecerá aquí.'}</p>
              <div className="cooperative-configuration__swatches">
                <span style={{ backgroundColor: profile.primaryColor }}>Principal</span>
                <span style={{ backgroundColor: profile.secondaryColor }}>Secundario</span>
              </div>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
