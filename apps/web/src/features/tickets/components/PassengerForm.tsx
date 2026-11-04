import type { SalePassengerForm } from '../types/ticketSale.types';
import './PassengerForm.css';

interface PassengerFormProps {
  index: number;
  total: number;
  form: SalePassengerForm;
  onChange: (field: keyof SalePassengerForm, value: string) => void;
  errors: Partial<Record<keyof SalePassengerForm, string>>;
  disabled?: boolean;
}

export function PassengerForm({
  index,
  total,
  form,
  onChange,
  errors,
  disabled = false,
}: PassengerFormProps) {
  return (
    <div className="passenger-form">
      <header className="passenger-form__header">
        <h3 className="passenger-form__title">
          Pasajero {index + 1} de {total}
        </h3>
      </header>
      <div className="passenger-form__grid">
        <div className="passenger-form__field">
          <label className="passenger-form__label" htmlFor={`cedula-${index}`}>
            Cédula
          </label>
          <input
            id={`cedula-${index}`}
            type="text"
            value={form.cedula}
            disabled={disabled}
            onChange={(e) => onChange('cedula', e.target.value.toUpperCase())}
            className="passenger-form__input"
            placeholder="Ej. 0102030405"
          />
          {errors.cedula && <p className="passenger-form__error">{errors.cedula}</p>}
        </div>

        <div className="passenger-form__field">
          <label className="passenger-form__label" htmlFor={`firstName-${index}`}>
            Nombre
          </label>
          <input
            id={`firstName-${index}`}
            type="text"
            value={form.firstName}
            disabled={disabled}
            onChange={(e) => onChange('firstName', e.target.value)}
            className="passenger-form__input"
            placeholder="Nombres"
          />
          {errors.firstName && <p className="passenger-form__error">{errors.firstName}</p>}
        </div>

        <div className="passenger-form__field">
          <label className="passenger-form__label" htmlFor={`lastName-${index}`}>
            Apellido
          </label>
          <input
            id={`lastName-${index}`}
            type="text"
            value={form.lastName}
            disabled={disabled}
            onChange={(e) => onChange('lastName', e.target.value)}
            className="passenger-form__input"
            placeholder="Apellidos"
          />
          {errors.lastName && <p className="passenger-form__error">{errors.lastName}</p>}
        </div>

        <div className="passenger-form__field">
          <label className="passenger-form__label" htmlFor={`birthDate-${index}`}>
            Fecha de nacimiento
          </label>
          <input
            id={`birthDate-${index}`}
            type="date"
            value={form.birthDate}
            disabled={disabled}
            onChange={(e) => onChange('birthDate', e.target.value)}
            className="passenger-form__input"
          />
          {errors.birthDate && <p className="passenger-form__error">{errors.birthDate}</p>}
        </div>

        <div className="passenger-form__field">
          <label className="passenger-form__label" htmlFor={`phone-${index}`}>
            Teléfono (opcional)
          </label>
          <input
            id={`phone-${index}`}
            type="tel"
            value={form.phone}
            disabled={disabled}
            onChange={(e) => onChange('phone', e.target.value)}
            className="passenger-form__input"
            placeholder="0999999999"
          />
          {errors.phone && <p className="passenger-form__error">{errors.phone}</p>}
        </div>

        <div className="passenger-form__field">
          <label className="passenger-form__label" htmlFor={`email-${index}`}>
            Correo electrónico (opcional)
          </label>
          <input
            id={`email-${index}`}
            type="email"
            value={form.email}
            disabled={disabled}
            onChange={(e) => onChange('email', e.target.value)}
            className="passenger-form__input"
            placeholder="correo@ejemplo.com"
          />
          {errors.email && <p className="passenger-form__error">{errors.email}</p>}
        </div>
      </div>
    </div>
  );
}
