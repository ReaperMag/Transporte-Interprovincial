import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  BUS_STAFF_POSITION_LABELS,
  BusStaffApiError,
  createBusStaff,
  getBusStaff,
  updateBusStaff,
} from '../services/busStaff.service';
import type {
  BusStaffMember,
  BusStaffPosition,
  BusStaffUpdate,
} from '../services/busStaff.service';
import { getCooperativeBuses } from '../services/bus.service';
import type { CooperativeBus } from '../services/bus.service';
import {
  cedulaError,
  cleanName,
  cleanPhone,
  emailError,
  nameError,
  onlyDigits,
  phoneError,
} from '../../../shared/utils/validation';
import './CooperativeOfficeUsersPage.css';
import './CooperativeBusStaffPage.css';

type DialogMode = 'create' | 'edit';

interface FormValues {
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string;
  position: BusStaffPosition;
  assignedBusId: string;
  password: string;
  confirmPassword: string;
}

const emptyValues: FormValues = {
  firstName: '',
  lastName: '',
  idNumber: '',
  email: '',
  phone: '',
  position: 'driver',
  assignedBusId: '',
  password: '',
  confirmPassword: '',
};

function formValuesFromMember(member?: BusStaffMember): FormValues {
  return member
    ? {
        firstName: member.firstName,
        lastName: member.lastName,
        idNumber: member.idNumber,
        email: member.email,
        phone: member.phone ?? '',
        position: member.position,
        assignedBusId: member.assignedBus ? String(member.assignedBus.id) : '',
        password: '',
        confirmPassword: '',
      }
    : emptyValues;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof BusStaffApiError ? error.message : fallback;
}

function sortMembers(members: BusStaffMember[]): BusStaffMember[] {
  return [...members].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
  );
}

export function CooperativeBusStaffPage() {
  const [members, setMembers] = useState<BusStaffMember[]>([]);
  const [buses, setBuses] = useState<CooperativeBus[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ mode: DialogMode; member?: BusStaffMember } | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getBusStaff(controller.signal), getCooperativeBuses()])
      .then(([staff, cooperativeBuses]) => {
        if (controller.signal.aborted) return;
        setMembers(sortMembers(staff));
        setBuses(cooperativeBuses);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError, 'No se pudo cargar el personal del bus.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [reloadKey]);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      [
        member.firstName,
        member.lastName,
        member.idNumber,
        member.email,
        member.assignedBus?.number ?? '',
        member.assignedBus?.plate ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [members, search]);

  const closeDialog = () => {
    setDialog(null);
    window.setTimeout(() => dialogTriggerRef.current?.focus(), 0);
  };

  const replaceMember = (saved: BusStaffMember) => {
    setMembers((current) => {
      const exists = current.some((member) => member.id === saved.id);
      return sortMembers(
        exists
          ? current.map((member) => (member.id === saved.id ? saved : member))
          : [...current, saved],
      );
    });
  };

  const handleSaved = (saved: BusStaffMember, mode: DialogMode) => {
    replaceMember(saved);
    setNotice(
      mode === 'create'
        ? `Se creó la cuenta de ${saved.firstName} ${saved.lastName}.`
        : `Se actualizaron los datos de ${saved.firstName} ${saved.lastName}.`,
    );
    closeDialog();
  };

  const toggleActive = async (member: BusStaffMember) => {
    const fullName = `${member.firstName} ${member.lastName}`;
    if (
      member.isActive &&
      !window.confirm(
        `¿Desactivar la cuenta de ${fullName}? No podrá iniciar sesión, pero su historial se conserva.`,
      )
    ) {
      return;
    }

    setProcessingId(member.id);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateBusStaff(member.id, { isActive: !member.isActive });
      replaceMember(saved);
      setNotice(
        saved.isActive
          ? `La cuenta de ${fullName} está activa.`
          : `La cuenta de ${fullName} fue desactivada.`,
      );
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo cambiar el estado de la cuenta.'));
    } finally {
      setProcessingId(null);
    }
  };

  const activeCount = members.filter((member) => member.isActive).length;

  return (
    <div className="office-users-page">
      <header className="office-users-page__intro">
        <div>
          <p className="office-users-page__kicker">Administración de la cooperativa</p>
          <h1>Personal del bus</h1>
          <p>Crea las cuentas de los conductores y controladores, y asígnales el bus.</p>
        </div>
        <button
          className="office-users-page__create"
          onClick={(event) => {
            dialogTriggerRef.current = event.currentTarget;
            setNotice(null);
            setDialog({ mode: 'create' });
          }}
          type="button"
        >
          Registrar personal
        </button>
      </header>

      <section className="office-users-card" aria-labelledby="bus-staff-title">
        <div className="office-users-card__toolbar">
          <div>
            <h2 id="bus-staff-title">Personal registrado</h2>
            <p>
              {activeCount} cuenta{activeCount === 1 ? '' : 's'} activa
              {activeCount === 1 ? '' : 's'} de {members.length}
            </p>
          </div>
          <label className="office-users-card__search">
            <span>Buscar personal</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, cédula, correo o bus"
              type="search"
              value={search}
            />
          </label>
        </div>

        {error && (
          <div className="office-users-card__error" role="alert">
            <span>{error}</span>
            <button
              onClick={() => {
                setIsLoading(true);
                setReloadKey((key) => key + 1);
              }}
              type="button"
            >
              Reintentar
            </button>
          </div>
        )}
        {notice && (
          <p className="bus-staff-page__notice" role="status">
            {notice}
          </p>
        )}

        <div className="office-users-table-wrap">
          <table className="office-users-table">
            <thead>
              <tr>
                <th>Nombres y apellidos</th>
                <th>Cargo</th>
                <th>Cédula</th>
                <th>Correo electrónico</th>
                <th>Bus asignado</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="office-users-table__message" colSpan={7}>
                    Cargando personal del bus...
                  </td>
                </tr>
              ) : filteredMembers.length === 0 ? (
                <tr>
                  <td className="office-users-table__message" colSpan={7}>
                    {search
                      ? 'No hay resultados para la búsqueda.'
                      : 'Aún no hay personal del bus registrado.'}
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>
                        {member.firstName} {member.lastName}
                      </strong>
                    </td>
                    <td>{BUS_STAFF_POSITION_LABELS[member.position]}</td>
                    <td>{member.idNumber}</td>
                    <td>{member.email}</td>
                    <td>
                      {member.assignedBus
                        ? `Bus ${member.assignedBus.number} · ${member.assignedBus.plate}`
                        : 'Sin bus'}
                    </td>
                    <td>
                      <span
                        className={`bus-staff-status ${
                          member.isActive
                            ? 'bus-staff-status--active'
                            : 'bus-staff-status--inactive'
                        }`}
                      >
                        {member.isActive ? 'Activa' : 'Desactivada'}
                      </span>
                    </td>
                    <td>
                      <div className="office-users-table__actions">
                        <button
                          className="office-users-table__edit"
                          disabled={processingId === member.id}
                          onClick={(event) => {
                            dialogTriggerRef.current = event.currentTarget;
                            setNotice(null);
                            setDialog({ mode: 'edit', member });
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className={
                            member.isActive
                              ? 'office-users-table__delete'
                              : 'bus-staff-table__activate'
                          }
                          disabled={processingId === member.id}
                          onClick={() => void toggleActive(member)}
                          type="button"
                        >
                          {member.isActive ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && (
        <BusStaffDialog
          buses={buses}
          member={dialog.member}
          mode={dialog.mode}
          onClose={closeDialog}
          onSaved={(saved) => handleSaved(saved, dialog.mode)}
        />
      )}
    </div>
  );
}

interface BusStaffDialogProps {
  buses: CooperativeBus[];
  member?: BusStaffMember;
  mode: DialogMode;
  onClose: () => void;
  onSaved: (member: BusStaffMember) => void;
}

function BusStaffDialog({ buses, member, mode, onClose, onSaved }: BusStaffDialogProps) {
  const [values, setValues] = useState(() => formValuesFromMember(member));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const isEdit = mode === 'edit';
  const dialogRef = useRef<HTMLElement | null>(null);
  const initialValuesRef = useRef(values);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  const updateValue = <Field extends keyof FormValues>(field: Field, value: FormValues[Field]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    setError(null);

    const validationError =
      nameError(values.firstName) ??
      nameError(values.lastName) ??
      cedulaError(values.idNumber.trim()) ??
      emailError(values.email) ??
      phoneError(values.phone, !isEdit);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!values.assignedBusId) {
      setError('Selecciona el bus asignado.');
      return;
    }
    if (!isEdit && values.password.length < 8) {
      setError('La contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    if (!isEdit && values.password !== values.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    const commonValues = {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      idNumber: values.idNumber.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      position: values.position,
      assignedBusId: Number(values.assignedBusId),
    };

    const changes: BusStaffUpdate = {};
    if (isEdit) {
      const initial = initialValuesRef.current;
      if (commonValues.firstName !== initial.firstName.trim()) {
        changes.firstName = commonValues.firstName;
      }
      if (commonValues.lastName !== initial.lastName.trim()) {
        changes.lastName = commonValues.lastName;
      }
      if (commonValues.idNumber !== initial.idNumber.trim()) {
        changes.idNumber = commonValues.idNumber;
      }
      if (commonValues.email !== initial.email.trim()) {
        changes.email = commonValues.email;
      }
      if (commonValues.phone !== initial.phone.trim()) {
        if (!commonValues.phone) {
          setError('No puedes vaciar un teléfono existente.');
          return;
        }
        changes.phone = commonValues.phone;
      }
      if (commonValues.position !== initial.position) {
        changes.position = commonValues.position;
      }
      if (values.assignedBusId !== initial.assignedBusId) {
        changes.assignedBusId = commonValues.assignedBusId;
      }
      if (Object.keys(changes).length === 0) {
        setError('No hay cambios para guardar.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const saved =
        isEdit && member
          ? await updateBusStaff(member.id, changes)
          : await createBusStaff({
              ...commonValues,
              password: values.password,
              confirmPassword: values.confirmPassword,
            });
      onSaved(saved);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo guardar la cuenta.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="office-users-dialog__backdrop">
      <section
        ref={dialogRef}
        className="office-users-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bus-staff-dialog-title"
        aria-describedby={error ? 'bus-staff-dialog-error' : undefined}
      >
        <header className="office-users-dialog__header">
          <div>
            <span className="office-users-dialog__eyebrow">Personal del bus</span>
            <h2 id="bus-staff-dialog-title">
              {isEdit ? 'Editar personal del bus' : 'Registrar personal del bus'}
            </h2>
          </div>
          <button
            aria-label="Cerrar"
            className="office-users-dialog__close"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="office-users-dialog__fields">
            <label>
              Nombres
              <input
                autoFocus
                maxLength={100}
                onChange={(event) => updateValue('firstName', cleanName(event.target.value))}
                required
                value={values.firstName}
                disabled={isSaving}
              />
            </label>
            <label>
              Apellidos
              <input
                maxLength={100}
                onChange={(event) => updateValue('lastName', cleanName(event.target.value))}
                required
                value={values.lastName}
                disabled={isSaving}
              />
            </label>
            <label>
              Cédula ecuatoriana
              <input
                inputMode="numeric"
                maxLength={10}
                minLength={10}
                onChange={(event) => updateValue('idNumber', onlyDigits(event.target.value, 10))}
                required
                value={values.idNumber}
                disabled={isSaving}
              />
            </label>
            <label>
              Correo electrónico
              <input
                autoComplete="email"
                maxLength={150}
                onChange={(event) => updateValue('email', event.target.value)}
                required
                type="email"
                value={values.email}
                disabled={isSaving}
              />
            </label>
            <label>
              Teléfono
              <input
                autoComplete="tel"
                maxLength={20}
                onChange={(event) => updateValue('phone', cleanPhone(event.target.value))}
                required={!isEdit}
                type="tel"
                value={values.phone}
                disabled={isSaving}
              />
            </label>
            <label>
              Cargo
              <select
                className="bus-staff-dialog__select"
                onChange={(event) =>
                  updateValue('position', event.target.value as BusStaffPosition)
                }
                value={values.position}
                disabled={isSaving}
              >
                <option value="driver">{BUS_STAFF_POSITION_LABELS.driver}</option>
                <option value="controller">{BUS_STAFF_POSITION_LABELS.controller}</option>
              </select>
            </label>
            <label>
              Bus asignado
              <select
                className="bus-staff-dialog__select"
                onChange={(event) => updateValue('assignedBusId', event.target.value)}
                required
                value={values.assignedBusId}
                disabled={isSaving}
              >
                <option value="">Selecciona un bus</option>
                {buses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    Bus {bus.number} · {bus.plate}
                  </option>
                ))}
              </select>
            </label>
            {!isEdit && (
              <label className="office-users-dialog__password-field">
                Contraseña inicial
                <span className="office-users-dialog__password-control">
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    onChange={(event) => updateValue('password', event.target.value)}
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={values.password}
                    disabled={isSaving}
                  />
                  <button
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    disabled={isSaving}
                    onClick={() => setShowPassword((visible) => !visible)}
                    type="button"
                  >
                    {showPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </span>
              </label>
            )}
            {!isEdit && (
              <label className="office-users-dialog__password-field">
                Confirmar contraseña
                <input
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  onChange={(event) => updateValue('confirmPassword', event.target.value)}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={values.confirmPassword}
                  disabled={isSaving}
                />
              </label>
            )}
          </div>
          {error && (
            <p className="office-users-dialog__error" id="bus-staff-dialog-error" role="alert">
              {error}
            </p>
          )}
          <footer className="office-users-dialog__actions">
            <button onClick={onClose} type="button" disabled={isSaving}>
              Cancelar
            </button>
            <button className="office-users-dialog__submit" type="submit" disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
