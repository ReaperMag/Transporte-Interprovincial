import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SeatSelectionForm } from '../../buses/components/SeatSelectionForm';
import type { TemplateSeat } from '../../buses/types/busTemplate.types';
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
  const [showSeatSelection, setShowSeatSelection] = useState(false);
  const [assignedSeats, setAssignedSeats] = useState<TemplateSeat[] | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<'automatic' | 'manual' | null>(null);
  const [seatAssignments, setSeatAssignments] = useState<Record<number, string>>({});

  const handleConfirmCount = (count: number) => {
    setPassengerCount(count);
    setForms(Array.from({ length: count }, () => createEmptyForm()));
    setErrors(Array.from({ length: count }, () => ({})));
    setIsModalOpen(false);
    setShowGlobalError(null);
    setShowSeatSelection(false);
    setAssignedSeats(null);
    setAssignmentMode(null);
    setSeatAssignments({});
  };

  const handleChange = (index: number, field: keyof SalePassengerForm, value: string) => {
    setShowSeatSelection(false);
    setAssignedSeats(null);
    setAssignmentMode(null);
    setSeatAssignments({});
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
      setShowSeatSelection(false);
      setShowGlobalError(
        'Revisa los datos obligatorios. Todos los pasajeros deben tener cédula, nombre, apellido y fecha de nacimiento con un formato válido.',
      );
    } else {
      setShowSeatSelection(true);
      setShowGlobalError(null);
    }
  };

  const handleConfirmSeatSelection = (seats: TemplateSeat[]) => {
    setAssignedSeats(seats);
    setAssignmentMode(null);
    setSeatAssignments({});
  };

  const handleAutomaticAssignment = () => {
    if (!assignedSeats) return;

    setSeatAssignments(Object.fromEntries(assignedSeats.map((seat, index) => [index, seat.id])));
    setAssignmentMode('automatic');
  };

  const handleManualAssignment = () => {
    setSeatAssignments({});
    setAssignmentMode('manual');
  };

  const handleSeatAssignmentChange = (passengerIndex: number, seatId: string) => {
    setSeatAssignments((currentAssignments) => {
      const nextAssignments = { ...currentAssignments };
      if (seatId) {
        nextAssignments[passengerIndex] = seatId;
      } else {
        delete nextAssignments[passengerIndex];
      }
      return nextAssignments;
    });
  };

  const completedPassengers = passengerCount
    ? forms.filter((form) => {
        const validation = validateForm(form);
        return (
          Object.keys(validation).length === 0 &&
          form.cedula.trim() &&
          form.firstName.trim() &&
          form.lastName.trim() &&
          form.birthDate
        );
      }).length
    : 0;

  const progressPercent = passengerCount
    ? Math.round((completedPassengers / passengerCount) * 100)
    : 0;

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
            <div
              className="seat-sale-page__progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
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
            <button
              type="button"
              className="seat-sale-page__button seat-sale-page__button--secondary"
              onClick={handleValidate}
            >
              Validar datos y elegir asientos
            </button>
          </div>
          {showGlobalError && <p className="seat-sale-page__global-error">{showGlobalError}</p>}
          {showSeatSelection && passengerCount && (
            <>
              <SeatSelectionForm
                title="Asigna los asientos a los pasajeros"
                description={`Selecciona ${passengerCount} asientos para los pasajeros registrados en este viaje.`}
                requiredSeatCount={passengerCount}
                continueLabel="Confirmar asignación"
                note="La selección es una demostración y todavía no se guarda ni procesa el pago."
                embedded
                onContinue={handleConfirmSeatSelection}
                onSelectionChange={() => {
                  setAssignedSeats(null);
                  setAssignmentMode(null);
                  setSeatAssignments({});
                }}
              />
              {assignedSeats && (
                <section
                  className="seat-sale-page__assignment"
                  aria-labelledby="seat-assignment-heading"
                  aria-live="polite"
                >
                  <h2 id="seat-assignment-heading">Asignación de asientos</h2>
                  <p>Elige cómo quieres asignar los asientos seleccionados a los pasajeros.</p>
                  <div className="seat-sale-page__assignment-actions">
                    <button
                      type="button"
                      className="seat-sale-page__button seat-sale-page__button--secondary"
                      onClick={handleAutomaticAssignment}
                    >
                      Asignar automáticamente
                    </button>
                    <button
                      type="button"
                      className="seat-sale-page__button seat-sale-page__button--secondary"
                      onClick={handleManualAssignment}
                    >
                      Asignar manualmente
                    </button>
                  </div>
                  {assignmentMode && (
                    <>
                      <ul>
                        {forms.map((passenger, index) => {
                          const assignedSeat = assignedSeats.find(
                            (seat) => seat.id === seatAssignments[index],
                          );

                          return (
                            <li key={index}>
                              <span>
                                {passenger.firstName} {passenger.lastName}
                              </span>
                              {assignmentMode === 'manual' ? (
                                <label className="seat-sale-page__assignment-control">
                                  <span>Asiento</span>
                                  <select
                                    value={seatAssignments[index] ?? ''}
                                    onChange={(event) =>
                                      handleSeatAssignmentChange(index, event.target.value)
                                    }
                                  >
                                    <option value="">Seleccionar asiento</option>
                                    {assignedSeats
                                      .filter(
                                        (seat) =>
                                          seat.id === seatAssignments[index] ||
                                          !Object.values(seatAssignments).includes(seat.id),
                                      )
                                      .map((seat) => (
                                        <option key={seat.id} value={seat.id}>
                                          Asiento {seat.number} · Piso {seat.floor}
                                          {seat.seatType === 'vip' ? ' · VIP' : ''}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                              ) : (
                                <span>
                                  {assignedSeat
                                    ? `Asiento ${assignedSeat.number} · Piso ${assignedSeat.floor}`
                                    : 'Sin asignar'}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="seat-sale-page__assignment-status" aria-live="polite">
                        {Object.keys(seatAssignments).length} de {forms.length} pasajeros con
                        asiento asignado.
                      </p>
                    </>
                  )}
                </section>
              )}
            </>
          )}
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
