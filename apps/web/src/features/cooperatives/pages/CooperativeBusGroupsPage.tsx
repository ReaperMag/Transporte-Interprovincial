import { useEffect, useState, type FormEvent } from 'react';
import {
  createCooperativeBusGroup,
  deleteCooperativeBusGroup,
  getCooperativeBusGroups,
  updateCooperativeBusGroup,
  type CooperativeBusGroup,
} from '../services/busGroup.service';
import './CooperativeBusGroupsPage.css';

export function CooperativeBusGroupsPage() {
  const [groups, setGroups] = useState<CooperativeBusGroup[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDescription, setEditingDescription] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadGroups() {
      try {
        const result = await getCooperativeBusGroups();
        if (active) {
          setGroups(result);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'No fue posible cargar los grupos.',
          );
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadGroups();
    return () => {
      active = false;
    };
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createCooperativeBusGroup({
        name,
        description: description.trim() || null,
      });
      setGroups((current) =>
        [...current, created].sort((first, second) => first.name.localeCompare(second.name)),
      );
      setName('');
      setDescription('');
      setSuccess('El grupo se creó correctamente.');
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No fue posible crear el grupo.',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (group: CooperativeBusGroup) => {
    setEditingId(group.id);
    setEditingName(group.name);
    setEditingDescription(group.description ?? '');
    setError(null);
    setSuccess(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName('');
    setEditingDescription('');
  };

  const handleUpdate = async (event: FormEvent<HTMLFormElement>, groupId: number) => {
    event.preventDefault();
    setSavingId(groupId);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateCooperativeBusGroup(groupId, {
        name: editingName,
        description: editingDescription.trim() || null,
      });
      setGroups((current) =>
        current
          .map((group) => (group.id === groupId ? updated : group))
          .sort((first, second) => first.name.localeCompare(second.name)),
      );
      cancelEditing();
      setSuccess('Los cambios del grupo se guardaron.');
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : 'No fue posible actualizar el grupo.',
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (group: CooperativeBusGroup) => {
    if (!window.confirm(`¿Eliminar el grupo "${group.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeletingId(group.id);
    setError(null);
    setSuccess(null);
    try {
      await deleteCooperativeBusGroup(group.id);
      setGroups((current) => current.filter((item) => item.id !== group.id));
      if (editingId === group.id) {
        cancelEditing();
      }
      setSuccess(`El grupo "${group.name}" se eliminó.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'No fue posible eliminar el grupo.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="cooperative-groups" aria-labelledby="cooperative-groups-title">
      <header className="cooperative-groups__header">
        <p className="cooperative-groups__eyebrow">Organización de flota</p>
        <h2 id="cooperative-groups-title">Grupos de buses</h2>
        <p>
          Organiza los buses de tu cooperativa por categorías. Cada grupo puede asociarse a varios
          buses.
        </p>
      </header>

      {error && (
        <p className="cooperative-groups__message cooperative-groups__message--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p
          className="cooperative-groups__message cooperative-groups__message--success"
          role="status"
        >
          {success}
        </p>
      )}

      <form className="cooperative-groups__create" onSubmit={handleCreate}>
        <h3>Crear grupo</h3>
        <div className="cooperative-groups__form-grid">
          <label>
            Nombre <span aria-hidden="true">*</span>
            <input
              required
              minLength={1}
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Rutas largas"
              disabled={isCreating}
            />
          </label>
          <label>
            Descripción <span className="cooperative-groups__optional">(opcional)</span>
            <input
              maxLength={255}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe brevemente este grupo"
              disabled={isCreating}
            />
          </label>
          <button type="submit" disabled={isCreating}>
            {isCreating ? 'Creando...' : 'Crear grupo'}
          </button>
        </div>
      </form>

      <section className="cooperative-groups__list" aria-labelledby="cooperative-groups-list-title">
        <div className="cooperative-groups__list-heading">
          <h3 id="cooperative-groups-list-title">Grupos registrados</h3>
          {!isLoading && <span>{groups.length}</span>}
        </div>

        {isLoading ? (
          <p className="cooperative-groups__empty" role="status">
            Cargando grupos...
          </p>
        ) : groups.length === 0 ? (
          <p className="cooperative-groups__empty">
            Aún no hay grupos. Crea uno para organizar los buses de tu cooperativa.
          </p>
        ) : (
          <ul className="cooperative-groups__items">
            {groups.map((group) => (
              <li className="cooperative-groups__item" key={group.id}>
                {editingId === group.id ? (
                  <form
                    className="cooperative-groups__edit-form"
                    onSubmit={(event) => void handleUpdate(event, group.id)}
                  >
                    <label>
                      Nombre
                      <input
                        required
                        maxLength={100}
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        disabled={savingId === group.id}
                      />
                    </label>
                    <label>
                      Descripción
                      <input
                        maxLength={255}
                        value={editingDescription}
                        onChange={(event) => setEditingDescription(event.target.value)}
                        disabled={savingId === group.id}
                      />
                    </label>
                    <div className="cooperative-groups__actions">
                      <button type="submit" disabled={savingId === group.id}>
                        {savingId === group.id ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        type="button"
                        className="cooperative-groups__button--secondary"
                        onClick={cancelEditing}
                        disabled={savingId === group.id}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="cooperative-groups__item-details">
                      <h4>{group.name}</h4>
                      <p>{group.description || 'Sin descripción'}</p>
                      <span>
                        {group.busCount} {group.busCount === 1 ? 'bus asociado' : 'buses asociados'}
                      </span>
                    </div>
                    <div className="cooperative-groups__actions">
                      <button
                        type="button"
                        className="cooperative-groups__button--secondary"
                        onClick={() => startEditing(group)}
                        disabled={deletingId === group.id}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="cooperative-groups__button--danger"
                        onClick={() => void handleDelete(group)}
                        disabled={deletingId === group.id || group.busCount > 0}
                        title={
                          group.busCount > 0
                            ? 'No se puede eliminar un grupo con buses asociados.'
                            : undefined
                        }
                      >
                        {deletingId === group.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
