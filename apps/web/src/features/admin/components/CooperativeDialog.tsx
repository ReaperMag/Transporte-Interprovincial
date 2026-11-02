import { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  Cooperative,
  CooperativeAccountCreate,
  CooperativeWrite,
} from '../types/admin.types';
import {
  AdminApiError,
  createCooperative,
  updateCooperative,
} from '../services/cooperatives.service';
import './CooperativeDialog.css';

interface CooperativeDialogProps {
  mode: 'create' | 'edit' | 'view';
  cooperative?: Cooperative;
  onClose: () => void;
  onSaved: () => void;
}

function toFormValues(cooperative?: Cooperative): CooperativeWrite {
  return {
    name: cooperative?.name ?? '',
    ruc: cooperative?.ruc ?? '',
    email: cooperative?.email ?? '',
    phone: cooperative?.phone ?? '',
    address: cooperative?.address ?? '',
  };
}

export function CooperativeDialog({
  mode,
  cooperative,
  onClose,
  onSaved,
}: CooperativeDialogProps) {
  const [values, setValues] = useState(() => toFormValues(cooperative));
  const [accountEmail, setAccountEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReadOnly = mode === 'view';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isReadOnly || isSaving) return;

    setIsSaving(true);
    setError(null);
    if (mode === 'create' && initialPassword !== confirmPassword) {
      setError('Las contraseñas iniciales no coinciden.');
      setIsSaving(false);
      return;
    }

    const payload: CooperativeWrite = {
      ...values,
      name: values.name.trim(),
      ruc: values.ruc.trim(),
      email: values.email?.trim() || null,
      phone: values.phone?.trim() || null,
      address: values.address?.trim() || null,
    };

    try {
      if (mode === 'edit' && cooperative) {
        await updateCooperative(cooperative.id, payload);
      } else {
        const createPayload: CooperativeAccountCreate = {
          name: payload.name,
          ruc: payload.ruc,
          phone: payload.phone,
          address: payload.address,
          accountEmail: accountEmail.trim(),
          initialPassword,
        };
        await createCooperative(createPayload);
      }
      onSaved();
    } catch (requestError) {
      setError(
        requestError instanceof AdminApiError
          ? requestError.message
          : 'No se pudo guardar la cooperativa.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const title =
    mode === 'create'
      ? 'Nueva cooperativa'
      : mode === 'edit'
        ? 'Editar cooperativa'
        : 'Detalle de cooperativa';

  return (
    <div className="cooperative-dialog__backdrop">
      <section
        aria-labelledby="cooperative-dialog-title"
        aria-modal="true"
        className="cooperative-dialog"
        role="dialog"
      >
        <header className="cooperative-dialog__header">
          <div className="cooperative-dialog__header-copy">
            <span className="cooperative-dialog__eyebrow">Ficha de cooperativa</span>
            <h2 id="cooperative-dialog-title">{title}</h2>
          </div>
          <button
            aria-label="Cerrar"
            className="cooperative-dialog__close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="cooperative-dialog__fields">
            <label className="cooperative-dialog__field--wide">
              Nombre de cooperativa
              <input
                autoFocus
                maxLength={150}
                onChange={(event) =>
                  setValues((current) => ({ ...current, name: event.target.value }))
                }
                required
                value={values.name}
                disabled={isReadOnly || isSaving}
              />
            </label>

            

            {mode === 'create' && (
              <>
                <label className="cooperative-dialog__field--wide">
                  Correo de registro
                  <input
                    autoComplete="username"
                    maxLength={150}
                    onChange={(event) => setAccountEmail(event.target.value)}
                    required
                    type="email"
                    value={accountEmail}
                    disabled={isSaving}
                  />
                </label>

                <label>
                  Contraseña inicial (mínimo 12 caracteres)
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    onChange={(event) => setInitialPassword(event.target.value)}
                    required
                    type="password"
                    value={initialPassword}
                    disabled={isSaving}
                  />
                </label>

                <label>
                  Confirmar contraseña inicial
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    type="password"
                    value={confirmPassword}
                    disabled={isSaving}
                  />
                </label>
                <p className="cooperative-dialog__hint cooperative-dialog__field--wide">
                  Esta cuenta quedará vinculada a la cooperativa. Entrega las
                  credenciales de forma segura; el panel de cooperativa aún no
                  está disponible.
                </p>
              </>
            )}

            {mode !== 'create' && (
              <label className="cooperative-dialog__field--wide">
                Correo de contacto
                <input
                  autoComplete="email"
                  maxLength={150}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, email: event.target.value }))
                  }
                  type="email"
                  value={values.email ?? ''}
                  disabled={isReadOnly || isSaving}
                />
              </label>
            )}
            <label>
              RUC
              <input
                inputMode="numeric"
                maxLength={13}
                minLength={13}
                onChange={(event) =>
                  setValues((current) => ({ ...current, ruc: event.target.value }))
                }
                pattern="\d{13}"
                required
                value={values.ruc}
                disabled={isReadOnly || isSaving}
              />
            </label>

            <label>
              Teléfono
              <input
                autoComplete="tel"
                maxLength={20}
                onChange={(event) =>
                  setValues((current) => ({ ...current, phone: event.target.value }))
                }
                type="tel"
                value={values.phone ?? ''}
                disabled={isReadOnly || isSaving}
              />
            </label>

            <label className="cooperative-dialog__field--wide">
              Dirección
              <input
                maxLength={255}
                onChange={(event) =>
                  setValues((current) => ({ ...current, address: event.target.value }))
                }
                value={values.address ?? ''}
                disabled={isReadOnly || isSaving}
              />
            </label>

          </div>

          {error && (
            <p className="cooperative-dialog__error" role="alert">
              {error}
            </p>
          )}

          <footer className="cooperative-dialog__actions">
            <button className="cooperative-dialog__cancel" onClick={onClose} type="button">
              {isReadOnly ? 'Cerrar' : 'Cancelar'}
            </button>
            {!isReadOnly && (
              <button className="cooperative-dialog__save" disabled={isSaving} type="submit">
                {isSaving ? 'Guardando...' : mode === 'edit' ? 'Guardar cambios' : 'Crear cooperativa'}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}
