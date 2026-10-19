import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SignupFormProps, SignupFormValues } from '../types/signup.types';
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

    if (props.mode === 'preview' || passwordsDoNotMatch || isLoading) {
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
          onChange={(event) => updateField('firstName', event.target.value)}
          autoComplete="given-name"
          placeholder="Ingresa tus nombres"
          maxLength={100}
          required
        />
      </div>

      <div className="signup-form__field">
        <label htmlFor="signup-last-name">Apellidos</label>
        <input
          id="signup-last-name"
          type="text"
          name="lastName"
          value={values.lastName}
          onChange={(event) => updateField('lastName', event.target.value)}
          autoComplete="family-name"
          placeholder="Ingresa tus apellidos"
          maxLength={100}
          required
        />
      </div>

      {/* Identificación del pasajero */}
      <div className="signup-form__field">
        <label htmlFor="signup-id-number">Cédula o pasaporte</label>
        <input
          id="signup-id-number"
          type="text"
          name="idNumber"
          value={values.idNumber}
          onChange={(event) => updateField('idNumber', event.target.value)}
          placeholder="Ingresa tu cédula o pasaporte"
          maxLength={13}
          pattern="[A-Za-z0-9]+"
          title="Ingresa únicamente letras y números."
          required
        />
      </div>

      <div className="signup-form__field">
        <label htmlFor="signup-email">Correo electrónico</label>
        <input
          id="signup-email"
          type="email"
          name="email"
          value={values.email}
          onChange={(event) => updateField('email', event.target.value)}
          autoComplete="email"
          placeholder="ejemplo@correo.com"
          required
        />
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
