import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createOfficeUser,
  deleteOfficeUser,
  getOfficeUsers,
  OfficeUserApiError,
  updateOfficeUser,
} from '../services/officeUsers.service';
import type { OfficeUser, OfficeUserUpdate } from '../services/officeUsers.service';
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

type DialogMode = 'create' | 'edit';

interface FormValues {
  firstName: string;
  lastName: string;
  idNumber: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const emptyValues: FormValues = {
  firstName: '',
  lastName: '',
  idNumber: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

function formValuesFromUser(user?: OfficeUser): FormValues {
  return user
    ? {
        firstName: user.firstName,
        lastName: user.lastName,
        idNumber: user.idNumber,
        email: user.email,
        phone: user.phone ?? '',
        password: '',
        confirmPassword: '',
      }
    : emptyValues;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof OfficeUserApiError ? error.message : fallback;
}

export function CooperativeOfficeUsersPage() {
  const [officeUsers, setOfficeUsers] = useState<OfficeUser[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: DialogMode; user?: OfficeUser } | null>(null);
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null);

  const loadOfficeUsers = useCallback(async (signal?: AbortSignal) => {
    try {
      setOfficeUsers(await getOfficeUsers(signal));
      setError(null);
    } catch (requestError) {
      if (!signal?.aborted) {
        setError(errorMessage(requestError, 'No se pudieron cargar los oficinistas.'));
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getOfficeUsers(controller.signal)
      .then((data) => {
        setOfficeUsers(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError, 'No se pudieron cargar los oficinistas.'));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return officeUsers;
    return officeUsers.filter((user) =>
      [user.firstName, user.lastName, user.idNumber, user.email]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [officeUsers, search]);

  const closeDialog = () => {
    setDialog(null);
    window.setTimeout(() => dialogTriggerRef.current?.focus(), 0);
  };

  const handleSaved = (savedUser: OfficeUser) => {
    setOfficeUsers((current) => {
      const exists = current.some((user) => user.id === savedUser.id);
      return exists
        ? current.map((user) => (user.id === savedUser.id ? savedUser : user))
        : [...current, savedUser].sort((a, b) =>
            `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
          );
    });
    closeDialog();
  };

  const removeOfficeUser = async (user: OfficeUser) => {
    if (
      !window.confirm(
        `¿Eliminar la cuenta de ${user.firstName} ${user.lastName}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setError(null);
    try {
      await deleteOfficeUser(user.id);
      setOfficeUsers((current) => current.filter((officeUser) => officeUser.id !== user.id));
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo eliminar el oficinista.'));
    }
  };

  return (
    <div className="office-users-page">
      <header className="office-users-page__intro">
        <div>
          <p className="office-users-page__kicker">Administración de la cooperativa</p>
          <h1>Gestión de oficinistas</h1>
          <p>Registra y actualiza las cuentas del personal de oficina de tu organización.</p>
        </div>
        <button
          className="office-users-page__create"
          onClick={(event) => {
            dialogTriggerRef.current = event.currentTarget;
            setDialog({ mode: 'create' });
          }}
          type="button"
        >
          Registrar oficinista
        </button>
      </header>

      <section className="office-users-card" aria-labelledby="office-users-title">
        <div className="office-users-card__toolbar">
          <div>
            <h2 id="office-users-title">Oficinistas registrados</h2>
            <p>
              {officeUsers.length} cuenta{officeUsers.length === 1 ? '' : 's'} en la cooperativa
            </p>
          </div>
          <label className="office-users-card__search">
            <span>Buscar oficinista</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, cédula o correo"
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
                void loadOfficeUsers();
              }}
              type="button"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="office-users-table-wrap">
          <table className="office-users-table">
            <thead>
              <tr>
                <th>Nombres y apellidos</th>
                <th>Cédula</th>
                <th>Correo electrónico</th>
                <th>Teléfono</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="office-users-table__message" colSpan={5}>
                    Cargando oficinistas...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td className="office-users-table__message" colSpan={5}>
                    {search
                      ? 'No hay resultados para la búsqueda.'
                      : 'Aún no hay oficinistas registrados.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>
                        {user.firstName} {user.lastName}
                      </strong>
                    </td>
                    <td>{user.idNumber}</td>
                    <td>{user.email}</td>
                    <td>{user.phone || '—'}</td>
                    <td>
                      <div className="office-users-table__actions">
                        <button
                          className="office-users-table__edit"
                          onClick={(event) => {
                            dialogTriggerRef.current = event.currentTarget;
                            setDialog({ mode: 'edit', user });
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="office-users-table__delete"
                          onClick={() => void removeOfficeUser(user)}
                          type="button"
                        >
                          Eliminar
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
        <OfficeUserDialog
          mode={dialog.mode}
          user={dialog.user}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

interface OfficeUserDialogProps {
  mode: DialogMode;
  user?: OfficeUser;
  onClose: () => void;
  onSaved: (user: OfficeUser) => void;
}

function OfficeUserDialog({ mode, user, onClose, onSaved }: OfficeUserDialogProps) {
  const [values, setValues] = useState(() => formValuesFromUser(user));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const isEdit = mode === 'edit';
  const dialogRef = useRef<HTMLElement | null>(null);
  const initialValuesRef = useRef(values);

  useEffect(() => {
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'input:not([disabled]), button:not([disabled])',
    );
    firstFocusable?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!isSaving) onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', handleKeyDown);
    return () => dialog.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  const updateValue = (field: keyof FormValues, value: string) => {
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
    if (!isEdit && values.password.length < 8) {
      setError('La contraseña debe tener entre 8 y 128 caracteres.');
      return;
    }
    if (!isEdit && values.password !== values.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    const phoneChanged = values.phone.trim() !== initialValuesRef.current.phone.trim();
    if (!isEdit || phoneChanged) {
      const phoneDigits = values.phone.replace(/\D/g, '');
      if (phoneDigits.length < 7 || phoneDigits.length > 10) {
        setError('El teléfono debe contener entre siete y diez dígitos.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const commonValues = {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        idNumber: values.idNumber.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
      };
      if (isEdit && user) {
        const initial = initialValuesRef.current;
        const changes: OfficeUserUpdate = {};
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
        const initialPhone = initial.phone.trim();
        if (commonValues.phone !== initialPhone) {
          if (!commonValues.phone) {
            setError('No puedes vaciar un teléfono existente.');
            return;
          }
          changes.phone = commonValues.phone;
        }
        if (Object.keys(changes).length === 0) {
          setError('No hay cambios para guardar.');
          return;
        }
        const savedUser = await updateOfficeUser(user.id, changes);
        onSaved(savedUser);
        return;
      }

      const savedUser = await createOfficeUser({
        ...commonValues,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      onSaved(savedUser);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo guardar el oficinista.'));
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
        aria-labelledby="office-user-dialog-title"
        aria-describedby={error ? 'office-user-dialog-error' : undefined}
      >
        <header className="office-users-dialog__header">
          <div>
            <span className="office-users-dialog__eyebrow">Personal de oficina</span>
            <h2 id="office-user-dialog-title">
              {isEdit ? 'Editar oficinista' : 'Registrar oficinista'}
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
                <span className="office-users-dialog__password-control">
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    onChange={(event) => updateValue('confirmPassword', event.target.value)}
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={values.confirmPassword}
                    disabled={isSaving}
                  />
                  <button
                    aria-label={
                      showConfirmPassword
                        ? 'Ocultar confirmación de contraseña'
                        : 'Mostrar confirmación de contraseña'
                    }
                    disabled={isSaving}
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    type="button"
                  >
                    {showConfirmPassword ? 'Ocultar' : 'Ver'}
                  </button>
                </span>
              </label>
            )}
          </div>
          {error && (
            <p className="office-users-dialog__error" id="office-user-dialog-error" role="alert">
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
