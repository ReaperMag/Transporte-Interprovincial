import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PassengerCountModal } from '../components/PassengerCountModal';
import { PassengerForm } from '../components/PassengerForm';
import type { SalePassengerForm } from '../types/ticketSale.types';
import './SeatSalePage.css';

function createEmptyForm(): SalePassengerForm {
  return {
    cedula: '',
    firstName: '',
    lastName: '',
    birthDate: '',
    phone: '',
    email: '',
  };
}

function validateForm(form: SalePassengerForm): Partial<Record<keyof SalePassengerForm, string>> {
  const errors: Partial<Record<keyof SalePassengerForm, string>> = {};

  const cedula = form.cedula.trim();
  if (!cedula) {
    errors.cedula = 'La cédula es obligatoria.';
  } else if (!/^[0-9A-Z]{5,13}$/.test(cedula)) {
    errors.cedula = 'La cédula debe contener solo letras y números (5 a 13 caracteres).';
  }

  const firstName = form.firstName.trim();
  if (!firstName) {
    errors.firstName = 'El nombre es obligatorio.';
  } else if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(firstName)) {
    errors.firstName = 'El nombre solo debe contener letras y espacios.';
  }

  const lastName = form.lastName.trim();
  if (!lastName) {
    errors.lastName = 'El apellido es obligatorio.';
  } else if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(lastName)) {
    errors.lastName = 'El apellido solo debe contener letras y espacios.';
  }

  if (!form.birthDate) {
    errors.birthDate = 'La fecha de nacimiento es obligatoria.';
  }

  const phone = form.phone.trim();
  if (phone) {
    if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      errors.phone = 'El teléfono tiene un formato no válido.';
    }
  }

  const email = form.email.trim();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'El correo electrónico tiene un formato no válido.';
    }
  }

  return errors;
}

export function SeatSalePage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [isModalOpen, setIsModalOpen] = useState(true);
  const [passengerCount, setPassengerCount] = useState<number | null>(null);
  const [forms, setForms] = useState<SalePassengerForm[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof SalePassengerForm, string>>[]>([]);
  const [showGlobalError, setShowGlobalError] = useState<string | null>(null);

  const handleConfirmCount = (count: number) => {
    setPassengerCount(count);
    setForms(Array.from({ length: count }, () => createEmptyForm()));
    setErrors(Array.from({ length: count }, () => ({})));
    setIsModalOpen(false);
    setShowGlobalError(null);
  };

  const handleChange = (index: number, field: keyof SalePassengerForm, value: string) => {
    setForms((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });

    setErrors((prev) => {
      const next = [...prev];
      const fieldErrors = { ...next[index] };
      delete fieldErrors[field];
      next[index] = fieldErrors;
      return next;
    });
  };

  const handleValidate = () => {
    if (!forms.length) return;
    const allErrors = forms.map((form) => validateForm(form));
    setErrors(allErrors);
    const hasErrors = allErrors.some((errorSet) => Object.keys(errorSet).length > 0);
    if (hasErrors) {
      setShowGlobalError('Revisa los datos obligatorios. Todos los pasajeros deben tener cédula, nombre, apellido y fecha de nacimiento con un formato válido.');
    } else {
      setShowGlobalError(null);
    }
  };

  const completedPassengers = passengerCount
    ? forms.filter((form) => {
        const validation = validateForm(form);
        return Object.keys(validation).length === 0 && form.cedula.trim() && form.firstName.trim() && form.lastName.trim() && form.birthDate;
      }).length
    : 0;

  const progressPercent = passengerCount ? Math.round((completedPassengers / passengerCount) * 100) : 0;

  return (
    <div className="seat-sale-page">
      <header className="seat-sale-page__header">
        <div>
          <h1 className="seat-sale-page__title">Venta de asientos</h1>
          <p className="seat-sale-page__subtitle">Viaje ID: {tripId}</p>
        </div>
        <Link to="/oficinista/panel" className="seat-sale-page__back-link">
          Volver al panel
        </Link>
      </header>

      {passengerCount && (
        <section className="seat-sale-page__progress">
          <div className="seat-sale-page__progress-header">
            <span>Progreso de llenado</span>
            <span>
              {completedPassengers}/{passengerCount} pasajeros completos
            </span>
          </div>
          <div className="seat-sale-page__progress-bar">
            <div className="seat-sale-page__progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>
      )}

      {passengerCount ? (
        <section className="seat-sale-page__forms">
          {forms.map((form, index) => (
            <PassengerForm
              key={index}
              index={index}
              total={passengerCount}
              form={form}
              onChange={(field, value) => handleChange(index, field, value)}
              errors={errors[index] || {}}
            />
          ))}
          <div className="seat-sale-page__actions">
            <button type="button" className="seat-sale-page__button seat-sale-page__button--secondary" onClick={handleValidate}>
              Validar datos
            </button>
            <button type="button" className="seat-sale-page__button seat-sale-page__button--primary">
              Comprar (pendiente)
            </button>
          </div>
          {showGlobalError && <p className="seat-sale-page__global-error">{showGlobalError}</p>}
        </section>
      ) : (
        <p className="seat-sale-page__hint">Selecciona la cantidad de personas para continuar.</p>
      )}

      <PassengerCountModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
        }}
        onConfirm={handleConfirmCount}
      />
    </div>
  );
}
