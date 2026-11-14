import { useState, type FormEvent } from 'react';
import type { Cooperative, CooperativeAccountCreate, CooperativeWrite } from '../types/admin.types';
import {
  AdminApiError,
  createCooperative,
  updateCooperative,
} from '../services/cooperatives.service';
import {
  cleanPhone,
  emailError,
  onlyDigits,
  phoneError,
  rucError,
} from '../../../shared/utils/validation';
import './CooperativeDialog.css';

interface CooperativeDialogProps {
  mode: 'create' | 'edit' | 'view';
  cooperative?: Cooperative;
  onClose: () => void;
  onSaved: () => void;
}

type FieldErrors = Partial<
  Record<
    | 'name'
    | 'ruc'
    | 'email'
    | 'phone'
    | 'address'
    | 'accountEmail'
    | 'initialPassword'
    | 'confirmPassword',
    string
  >
>;

function toFormValues(cooperative?: Cooperative): CooperativeWrite {
  return {
    name: cooperative?.name ?? '',
    ruc: cooperative?.ruc ?? '',
    email: cooperative?.email ?? '',
    phone: cooperative?.phone ?? '',
    address: cooperative?.address ?? '',
  };
}

function validateInstitutionalInfo(values: CooperativeWrite): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  const address = values.address?.trim() ?? '';

  if (!name) errors.name = 'Ingresa el nombre de la cooperativa.';
  else if (name.length > 150) errors.name = 'El nombre no puede superar 150 caracteres.';

  const rucValidation = rucError(values.ruc.trim());
  if (rucValidation) errors.ruc = rucValidation;

  const emailValidation = emailError(values.email ?? '', false);
  if (emailValidation) errors.email = emailValidation;

  const phoneValidation = phoneError(values.phone ?? '');
  if (phoneValidation) errors.phone = phoneValidation;

  if (address.length > 255) errors.address = 'La dirección no puede superar 255 caracteres.';

  return errors;
}

function validateAccessCredentials(
  accountEmail: string,
  initialPassword: string,
  confirmPassword: string,
): FieldErrors {
  const errors: FieldErrors = {};
  const emailValidation = emailError(accountEmail);

  if (emailValidation) errors.accountEmail = emailValidation;
  if (initialPassword.length < 12) {
    errors.initialPassword = 'La contraseña debe tener al menos 12 caracteres.';
  } else if (initialPassword.length > 128) {
    errors.initialPassword = 'La contraseña no puede superar 128 caracteres.';
  }
  if (!confirmPassword) errors.confirmPassword = 'Confirma la contraseña.';
  else if (initialPassword !== confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

export function CooperativeDialog({ mode, cooperative, onClose, onSaved }: CooperativeDialogProps) {
  const [values, setValues] = useState(() => toFormValues(cooperative));
  const [accountEmail, setAccountEmail] = useState('');
  const [initialPassword, setInitialPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReadOnly = mode === 'view';

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isReadOnly || isSaving) return;

    setError(null);
    if (mode === 'create' && step === 1) {
      const errors = validateInstitutionalInfo(values);
      setFieldErrors((current) => ({
        ...current,
        ...errors,
      }));
      if (Object.keys(errors).length > 0) return;
      setStep(2);
      return;
    }

    if (mode === 'create') {
      const errors = validateAccessCredentials(accountEmail, initialPassword, confirmPassword);
      setFieldErrors((current) => ({
        ...current,
        ...errors,
      }));
      if (Object.keys(errors).length > 0) return;
    } else {
      const validationError =
        rucError(values.ruc.trim()) ??
        phoneError(values.phone ?? '') ??
        emailError(values.email ?? '', false);
      if (!values.name.trim()) {
        setError('Ingresa el nombre de la cooperativa.');
        return;
      }
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setIsSaving(true);
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
          ...payload,
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
  const institutionalStep = mode !== 'create' || step === 1;

  function fieldError(field: keyof FieldErrors) {
    const message = fieldErrors[field];
    return message ? (
      <span className="cooperative-dialog__field-error" id={`${field}-error`}>
        {message}
      </span>
    ) : null;
  }

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

        {mode === 'create' && (
          <ol className="cooperative-dialog__steps" aria-label="Pasos de registro">
            <li aria-current={step === 1 ? 'step' : undefined}>
              <span>1</span>
              <span>Datos institucionales</span>
            </li>
            <li aria-current={step === 2 ? 'step' : undefined}>
              <span>2</span>
              <span>Credenciales de acceso</span>
            </li>
          </ol>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {mode === 'create' && (
            <p className="cooperative-dialog__step-title">
              Paso {step} de 2: {step === 1 ? 'Datos institucionales' : 'Credenciales de acceso'}
            </p>
          )}

          <div className="cooperative-dialog__fields">
            {institutionalStep ? (
              <>
                <label className="cooperative-dialog__field--wide" htmlFor="cooperative-name">
                  Nombre de cooperativa
                  <input
                    autoFocus
                    id="cooperative-name"
                    maxLength={150}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, name: event.target.value }));
                      clearFieldError('name');
                    }}
                    required
                    value={values.name}
                    disabled={isReadOnly || isSaving}
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                  />
                  {fieldError('name')}
                </label>

                <label htmlFor="cooperative-ruc">
                  RUC
                  <input
                    id="cooperative-ruc"
                    inputMode="numeric"
                    maxLength={13}
                    minLength={13}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        ruc: onlyDigits(event.target.value, 13),
                      }));
                      clearFieldError('ruc');
                    }}
                    pattern="\\d{13}"
                    required
                    value={values.ruc}
                    disabled={isReadOnly || isSaving}
                    aria-invalid={Boolean(fieldErrors.ruc)}
                    aria-describedby={fieldErrors.ruc ? 'ruc-error' : undefined}
                  />
                  {fieldError('ruc')}
                </label>

                <label htmlFor="cooperative-phone">
                  Teléfono
                  <input
                    autoComplete="tel"
                    id="cooperative-phone"
                    maxLength={20}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        phone: cleanPhone(event.target.value),
                      }));
                      clearFieldError('phone');
                    }}
                    type="tel"
                    value={values.phone ?? ''}
                    disabled={isReadOnly || isSaving}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                  />
                  {fieldError('phone')}
                </label>

                <label className="cooperative-dialog__field--wide" htmlFor="cooperative-email">
                  Correo institucional
                  <input
                    autoComplete="email"
                    id="cooperative-email"
                    maxLength={150}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, email: event.target.value }));
                      clearFieldError('email');
                    }}
                    type="email"
                    value={values.email ?? ''}
                    disabled={isReadOnly || isSaving}
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  />
                  {fieldError('email')}
                </label>

                <label className="cooperative-dialog__field--wide" htmlFor="cooperative-address">
                  Dirección
                  <input
                    id="cooperative-address"
                    maxLength={255}
                    onChange={(event) => {
                      setValues((current) => ({ ...current, address: event.target.value }));
                      clearFieldError('address');
                    }}
                    value={values.address ?? ''}
                    disabled={isReadOnly || isSaving}
                    aria-invalid={Boolean(fieldErrors.address)}
                    aria-describedby={fieldErrors.address ? 'address-error' : undefined}
                  />
                  {fieldError('address')}
                </label>
              </>
            ) : (
              <>
                <label className="cooperative-dialog__field--wide" htmlFor="account-email">
                  Correo de acceso
                  <input
                    autoComplete="username"
                    id="account-email"
                    maxLength={150}
                    onChange={(event) => {
                      setAccountEmail(event.target.value);
                      clearFieldError('accountEmail');
                    }}
                    required
                    type="email"
                    value={accountEmail}
                    disabled={isSaving}
                    aria-invalid={Boolean(fieldErrors.accountEmail)}
                    aria-describedby={fieldErrors.accountEmail ? 'accountEmail-error' : undefined}
                  />
                  {fieldError('accountEmail')}
                </label>

                <label htmlFor="initial-password">
                  Contraseña inicial (mínimo 12 caracteres)
                  <input
                    autoComplete="new-password"
                    id="initial-password"
                    minLength={12}
                    maxLength={128}
                    onChange={(event) => {
                      setInitialPassword(event.target.value);
                      clearFieldError('initialPassword');
                      clearFieldError('confirmPassword');
                    }}
                    required
                    type="password"
                    value={initialPassword}
                    disabled={isSaving}
                    aria-invalid={Boolean(fieldErrors.initialPassword)}
                    aria-describedby={
                      fieldErrors.initialPassword ? 'initialPassword-error' : undefined
                    }
                  />
                  {fieldError('initialPassword')}
                </label>

                <label htmlFor="confirm-password">
                  Confirmar contraseña inicial
                  <input
                    autoComplete="new-password"
                    id="confirm-password"
                    minLength={12}
                    maxLength={128}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      clearFieldError('confirmPassword');
                    }}
                    required
                    type="password"
                    value={confirmPassword}
                    disabled={isSaving}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={
                      fieldErrors.confirmPassword ? 'confirmPassword-error' : undefined
                    }
                  />
                  {fieldError('confirmPassword')}
                </label>
                <p className="cooperative-dialog__hint cooperative-dialog__field--wide">
                  La cuenta quedará vinculada a esta cooperativa. Guarda y entrega las credenciales
                  de forma segura.
                </p>
              </>
            )}
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
            {mode === 'create' && step === 2 && (
              <button
                className="cooperative-dialog__cancel"
                onClick={() => setStep(1)}
                type="button"
                disabled={isSaving}
              >
                Atrás
              </button>
            )}
            {!isReadOnly &&
              (mode === 'create' ? (
                <button className="cooperative-dialog__save" disabled={isSaving} type="submit">
                  {isSaving ? 'Creando...' : step === 1 ? 'Continuar' : 'Crear cooperativa'}
                </button>
              ) : (
                <button className="cooperative-dialog__save" disabled={isSaving} type="submit">
                  {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              ))}
          </footer>
        </form>
      </section>
    </div>
  );
}
