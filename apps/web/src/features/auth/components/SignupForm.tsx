import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SignupFormProps, SignupFormValues } from '../types/signup.types';
import {
  cedulaError,
  cleanName,
  emailError,
  nameError,
  onlyDigits,
} from '../../../shared/utils/validation';
import './SignupForm.css';

const initialValues: SignupFormValues = {
  firstName: '',
  lastName: '',
  idNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export function SignupForm(props: SignupFormProps) {
  const [values, setValues] = useState<SignupFormValues>(initialValues);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof SignupFormValues, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const fieldErrors = {
    firstName: nameError(values.firstName),
    lastName: nameError(values.lastName),
    idNumber: cedulaError(values.idNumber),
    email: emailError(values.email),
  };
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  function visibleError(field: keyof typeof fieldErrors): string | null {
    return submitted || touched[field] ? fieldErrors[field] : null;
  }

  function markTouched(field: keyof SignupFormValues) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  const passwordsDoNotMatch =
    values.confirmPassword.length > 0 && values.password !== values.confirmPassword;

  const isPreview = props.mode === 'preview';
  const isLoading = props.mode === 'interactive' && (props.isLoading ?? false);

  function updateField(field: keyof SignupFormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSubmitted(true);

    if (props.mode === 'preview' || passwordsDoNotMatch || hasFieldErrors || isLoading) {
      return;
    }

    props.onSubmit({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      idNumber: values.idNumber.trim(),
      email: values.email.trim(),
      password: values.password,
      confirmPassword: values.confirmPassword,
    });
  }

  return (
    <form className="signup-form" onSubmit={handleSubmit}>
      <div className="signup-form__field">
        <label htmlFor="signup-first-name">Nombres</label>
        <input
          id="signup-first-name"
          type="text"
          name="firstName"
          value={values.firstName}
          onChange={(event) => updateField('firstName', cleanName(event.target.value))}
          onBlur={() => markTouched('firstName')}
          aria-invalid={Boolean(visibleError('firstName'))}
          autoComplete="given-name"
          placeholder="Ingresa tus nombres"
          maxLength={100}
          required
        />
        {visibleError('firstName') && (
          <p className="signup-form__error" role="alert">
            {visibleError('firstName')}
          </p>
        )}
      </div>

      <div className="signup-form__field">
        <label htmlFor="signup-last-name">Apellidos</label>
        <input
          id="signup-last-name"
          type="text"
          name="lastName"
          value={values.lastName}
          onChange={(event) => updateField('lastName', cleanName(event.target.value))}
          onBlur={() => markTouched('lastName')}
          aria-invalid={Boolean(visibleError('lastName'))}
          autoComplete="family-name"
          placeholder="Ingresa tus apellidos"
          maxLength={100}
          required
        />
        {visibleError('lastName') && (
          <p className="signup-form__error" role="alert">
            {visibleError('lastName')}
          </p>
        )}
      </div>

      {/* Identificación del pasajero */}
      <div className="signup-form__field">
        <label htmlFor="signup-id-number">Cédula</label>
        <input
          id="signup-id-number"
          type="text"
          name="idNumber"
          value={values.idNumber}
          onChange={(event) => updateField('idNumber', onlyDigits(event.target.value, 10))}
          onBlur={() => markTouched('idNumber')}
          aria-invalid={Boolean(visibleError('idNumber'))}
          placeholder="Ingresa tu cédula de 10 números"
          inputMode="numeric"
          maxLength={10}
          required
        />
        {visibleError('idNumber') && (
          <p className="signup-form__error" role="alert">
            {visibleError('idNumber')}
          </p>
        )}
      </div>

      <div className="signup-form__field">
        <label htmlFor="signup-email">Correo electrónico</label>
        <input
          id="signup-email"
          type="email"
          name="email"
          value={values.email}
          onChange={(event) => updateField('email', event.target.value.trim())}
          onBlur={() => markTouched('email')}
          aria-invalid={Boolean(visibleError('email'))}
          autoComplete="email"
          placeholder="ejemplo@correo.com"
          required
        />
        {visibleError('email') && (
          <p className="signup-form__error" role="alert">
            {visibleError('email')}
          </p>
        )}
      </div>

      <div className="signup-form__field">
        <label htmlFor="signup-password">Contraseña</label>
        <div className="signup-form__password-wrapper">
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            value={values.password}
            onChange={(event) => updateField('password', event.target.value)}
            autoComplete="new-password"
            placeholder="Crea una contraseña"
            minLength={8}
            maxLength={128}
            required
          />
          <button
            type="button"
            className="signup-form__toggle"
            onClick={() => setShowPassword((current) => !current)}
            disabled={isLoading}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            {showPassword ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>

      <div className="signup-form__field">
        <label htmlFor="signup-confirm-password">Confirmar contraseña</label>
        <div className="signup-form__password-wrapper">
          <input
            id="signup-confirm-password"
            type={showConfirmPassword ? 'text' : 'password'}
            name="confirmPassword"
            value={values.confirmPassword}
            onChange={(event) => updateField('confirmPassword', event.target.value)}
            autoComplete="new-password"
            placeholder="Repite tu contraseña"
            minLength={8}
            maxLength={128}
            required
            aria-invalid={passwordsDoNotMatch}
            aria-describedby={passwordsDoNotMatch ? 'signup-password-error' : undefined}
          />
          <button
            type="button"
            className="signup-form__toggle"
            onClick={() => setShowConfirmPassword((current) => !current)}
            disabled={isLoading}
            aria-label={
              showConfirmPassword
                ? 'Ocultar confirmación de contraseña'
                : 'Mostrar confirmación de contraseña'
            }
          >
            {showConfirmPassword ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>

        {passwordsDoNotMatch && (
          <p id="signup-password-error" className="signup-form__error" role="alert">
            Las contraseñas no coinciden.
          </p>
        )}
      </div>

      {props.mode === 'interactive' && props.error && (
        <p className="signup-form__error" role="alert">
          {props.error}
        </p>
      )}

      <button className="signup-form__submit" type="submit" disabled={isPreview || isLoading}>
        {isLoading ? 'Procesando...' : 'Crear cuenta'}
      </button>

      {isPreview && (
        <p className="signup-form__notice">
          El registro estará disponible cuando se habilite el servicio de creación de cuentas.
        </p>
      )}
    </form>
  );
}
