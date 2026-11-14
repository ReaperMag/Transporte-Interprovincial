import { useEffect, useState, type FormEvent } from 'react';
import {
  createCooperativeSeatType,
  deleteCooperativeSeatType,
  getCooperativeSeatTypes,
  updateCooperativeSeatType,
  type CooperativeSeatType,
} from '../services/seatType.service';
import './CooperativeSeatTypesPage.css';

function sortSeatTypes(items: CooperativeSeatType[]): CooperativeSeatType[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.';
}

export function CooperativeSeatTypesPage() {
  const [seatTypes, setSeatTypes] = useState<CooperativeSeatType[]>([]);
  const [name, setName] = useState('');
  const [percentage, setPercentage] = useState('0');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSeatTypes() {
      try {
        const result = await getCooperativeSeatTypes();
        if (active) {
          setSeatTypes(sortSeatTypes(result));
        }
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadSeatTypes();

    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPercentage('0');
  };

  const startEditing = (seatType: CooperativeSeatType) => {
    setEditingId(seatType.id);
    setName(seatType.name);
    setPercentage(String(seatType.percentage));
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedPercentage = percentage.trim();

    if (!normalizedName) {
      setError('El nombre del tipo de asiento es obligatorio.');
      setSuccess(null);
      return;
    }

    if (
      !/^\d+(\.\d{1,2})?$/.test(normalizedPercentage) ||
      Number(normalizedPercentage) > 99999.99
    ) {
      setError('Ingresa un porcentaje válido con máximo dos decimales.');
      setSuccess(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const input = {
        name: normalizedName,
        percentage: normalizedPercentage,
      };

      if (editingId !== null) {
        const updated = await updateCooperativeSeatType(editingId, input);

        setSeatTypes((current) =>
          sortSeatTypes(current.map((item) => (item.id === editingId ? updated : item))),
        );

        setSuccess('El tipo de asiento se actualizó correctamente.');
      } else {
        const created = await createCooperativeSeatType(input);

        setSeatTypes((current) => sortSeatTypes([...current, created]));

        setSuccess('El tipo de asiento se registró correctamente.');
      }

      resetForm();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (seatType: CooperativeSeatType) => {
    if (
      !window.confirm(
        `¿Eliminar el tipo de asiento "${seatType.name}"? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }

    setDeletingId(seatType.id);
    setError(null);
    setSuccess(null);

    try {
      await deleteCooperativeSeatType(seatType.id);

      setSeatTypes((current) => current.filter((item) => item.id !== seatType.id));

      if (editingId === seatType.id) {
        resetForm();
      }

      setSuccess(`El tipo "${seatType.name}" se eliminó correctamente.`);
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setDeletingId(null);
    }
  };

  const isBusy = isSaving || deletingId !== null;

  return (
    <section className="cooperative-seat-types" aria-labelledby="cooperative-seat-types-title">
      <header className="cooperative-seat-types__header">
        <p className="cooperative-seat-types__eyebrow">Configuración de buses</p>

        <h2 id="cooperative-seat-types-title">Tipos de asiento</h2>

        <p>
          Crea y administra los tipos de asiento de tu cooperativa y sus porcentajes adicionales.
          Podrás utilizarlos al configurar las plantillas de tus buses.
        </p>
      </header>

      {error && (
        <p
          className="cooperative-seat-types__message cooperative-seat-types__message--error"
          role="alert"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          className="cooperative-seat-types__message cooperative-seat-types__message--success"
          role="status"
        >
          {success}
        </p>
      )}

      <section className="cooperative-seat-types__step" aria-labelledby="seat-types-form-title">
        <div className="cooperative-seat-types__step-heading">
          <span aria-hidden="true">1</span>

          <div>
            <h3 id="seat-types-form-title">
              {editingId !== null ? 'Editar tipo de asiento' : 'Registrar tipo de asiento'}
            </h3>

            <p>Define un nombre y el porcentaje adicional correspondiente a ese tipo de asiento.</p>
          </div>
        </div>

        <form onSubmit={(event) => void handleSave(event)}>
          <div className="cooperative-seat-types__form-grid">
            <label htmlFor="seat-type-name">
              Nombre del tipo
              <input
                id="seat-type-name"
                type="text"
                maxLength={100}
                placeholder="Ej. Normal, VIP, Ejecutivo"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isBusy}
                required
              />
            </label>

            <label htmlFor="seat-type-percentage">
              Porcentaje adicional (%)
              <input
                id="seat-type-percentage"
                type="number"
                min="0"
                max="99999.99"
                step="0.01"
                value={percentage}
                onChange={(event) => setPercentage(event.target.value)}
                disabled={isBusy}
                required
              />
            </label>
          </div>

          <p className="cooperative-seat-types__help">
            Ejemplo: Normal 0 %, VIP 10 % y Ejecutivo 15 %.
          </p>

          <div className="cooperative-seat-types__actions">
            <button
              className="cooperative-seat-types__button-primary"
              type="submit"
              disabled={isBusy}
            >
              {isSaving
                ? 'Guardando...'
                : editingId !== null
                  ? 'Guardar cambios'
                  : 'Registrar tipo'}
            </button>

            {editingId !== null && (
              <button
                className="cooperative-seat-types__button-secondary"
                type="button"
                onClick={resetForm}
                disabled={isBusy}
              >
                Cancelar edición
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="cooperative-seat-types__step" aria-labelledby="seat-types-list-title">
        <div className="cooperative-seat-types__step-heading cooperative-seat-types__step-heading--list">
          <span aria-hidden="true">2</span>

          <div>
            <h3 id="seat-types-list-title">Tipos registrados</h3>

            <p>Consulta tus tipos, actualiza sus porcentajes o elimina los que no estén en uso.</p>
          </div>

          <span className="cooperative-seat-types__count">
            {seatTypes.length} {seatTypes.length === 1 ? 'tipo' : 'tipos'}
          </span>
        </div>

        {isLoading ? (
          <p className="cooperative-seat-types__empty" role="status">
            Cargando tipos de asiento...
          </p>
        ) : seatTypes.length === 0 ? (
          <div className="cooperative-seat-types__empty">
            <strong>Aún no hay tipos registrados.</strong>

            <p>Utiliza el formulario anterior para agregar el primer tipo de asiento.</p>
          </div>
        ) : (
          <div className="cooperative-seat-types__table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Porcentaje adicional</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {seatTypes.map((seatType) => (
                  <tr key={seatType.id}>
                    <td className="cooperative-seat-types__type-name">{seatType.name}</td>

                    <td>
                      <span className="cooperative-seat-types__percentage">
                        {Number(seatType.percentage).toFixed(2)} %
                      </span>
                    </td>

                    <td>
                      <div className="cooperative-seat-types__row-actions">
                        <button
                          type="button"
                          className="cooperative-seat-types__button-secondary"
                          onClick={() => startEditing(seatType)}
                          disabled={isBusy}
                          aria-label={`Editar ${seatType.name}`}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          className="cooperative-seat-types__button-danger"
                          onClick={() => void handleDelete(seatType)}
                          disabled={isBusy}
                          aria-label={`Eliminar ${seatType.name}`}
                        >
                          {deletingId === seatType.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
