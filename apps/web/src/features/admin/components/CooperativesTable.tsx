import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Cooperative } from '../types/admin.types';
import {
  AdminApiError,
  deleteCooperative,
  getCooperatives,
  updateCooperativeStatus,
} from '../services/cooperatives.service';
import { CooperativeDialog } from './CooperativeDialog';
import './CooperativesTable.css';

interface CooperativesTableProps {
  onDataChanged: () => void;
}

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit' | 'view'; cooperative: Cooperative };

function CooperativeLogo({ cooperative }: { cooperative: Cooperative }) {
  const initials = cooperative.name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  if (cooperative.logoUrl) {
    return (
      <img
        className="cooperatives-table__logo cooperatives-table__logo--image"
        src={cooperative.logoUrl}
        alt={`Logo de ${cooperative.name}`}
        loading="lazy"
      />
    );
  }

  return (
    <span className="cooperatives-table__logo" aria-hidden="true">
      {initials}
    </span>
  );
}

export function CooperativesTable({ onDataChanged }: CooperativesTableProps) {
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([]);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const loadCooperatives = useCallback(async (signal?: AbortSignal) => {
    try {
      const isActive =
        statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined;
      const data = await getCooperatives(search, isActive, signal);
      setCooperatives(data);
      setError(null);
    } catch (requestError) {
      if (!signal?.aborted) {
        setError(
          requestError instanceof AdminApiError
            ? requestError.message
            : 'No se pudieron cargar las cooperativas.',
        );
      }
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    const isActive =
      statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined;
    getCooperatives(search, isActive, controller.signal)
      .then((data) => {
        setCooperatives(data);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof AdminApiError
              ? requestError.message
              : 'No se pudieron cargar las cooperativas.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [search, statusFilter]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSearch(searchDraft.trim());
  };

  const handleSaved = () => {
    setDialog(null);
    setIsLoading(true);
    void loadCooperatives();
    onDataChanged();
  };

  const handleToggleStatus = async (cooperative: Cooperative) => {
    setBusyId(cooperative.id);
    setError(null);
    try {
      await updateCooperativeStatus(cooperative.id, !cooperative.isActive);
      await loadCooperatives();
      onDataChanged();
    } catch (requestError) {
      setError(
        requestError instanceof AdminApiError
          ? requestError.message
          : 'No se pudo actualizar el estado de la cooperativa.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (cooperative: Cooperative) => {
    const confirmed = window.confirm(
      `¿Eliminar la cooperativa "${cooperative.name}"? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setBusyId(cooperative.id);
    setError(null);
    try {
      await deleteCooperative(cooperative.id);
      await loadCooperatives();
      onDataChanged();
    } catch (requestError) {
      setError(
        requestError instanceof AdminApiError
          ? requestError.message
          : 'No se pudo eliminar la cooperativa.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <section className="cooperatives-card" aria-labelledby="cooperatives-title">
        <header className="cooperatives-card__header">
          <div>
            <h2 className="cooperatives-card__title" id="cooperatives-title">
              Cooperativas
            </h2>
            <p className="cooperatives-card__subtitle">Gestión de Cooperativas</p>
          </div>

          <button
            className="cooperatives-card__create"
            onClick={() => setDialog({ mode: 'create' })}
            type="button"
          >
            Nueva Cooperativa
          </button>
        </header>

        <form className="cooperatives-toolbar" onSubmit={handleSearch}>
          <label className="cooperatives-toolbar__search">
            <span>Buscar cooperativa</span>
            <input
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Nombre, RUC o correo"
              type="search"
              value={searchDraft}
            />
          </label>
          <label className="cooperatives-toolbar__status">
            <span>Estado</span>
            <select
              onChange={(event) => {
                setIsLoading(true);
                setError(null);
                setStatusFilter(event.target.value);
              }}
              value={statusFilter}
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </label>
          <button className="cooperatives-toolbar__filter" type="submit">
            Buscar
          </button>
        </form>

        {error && (
          <div className="cooperatives-table__error" role="alert">
            <span>{error}</span>
            <button
              onClick={() => {
                setIsLoading(true);
                void loadCooperatives();
              }}
              type="button"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="cooperatives-table-wrap">
          <table className="cooperatives-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Nombre de Cooperativa</th>
                <th>Correo de Contacto</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="cooperatives-table__message" colSpan={6}>
                    Cargando cooperativas...
                  </td>
                </tr>
              ) : cooperatives.length === 0 ? (
                <tr>
                  <td className="cooperatives-table__message" colSpan={6}>
                    {error
                      ? 'No fue posible cargar los datos.'
                      : 'No hay cooperativas que coincidan con la búsqueda.'}
                  </td>
                </tr>
              ) : (
                cooperatives.map((cooperative) => (
                  <tr key={cooperative.id}>
                    <td>
                      <CooperativeLogo cooperative={cooperative} />
                    </td>
                    <td>{cooperative.name}</td>
                    <td>{cooperative.email || '—'}</td>
                    <td>{cooperative.phone || '—'}</td>
                    <td>
                      <div className="cooperatives-table__status">
                        <span>{cooperative.isActive ? 'Activo' : 'Inactivo'}</span>
                        <button
                          aria-checked={cooperative.isActive}
                          aria-label={`Cambiar estado de ${cooperative.name}`}
                          className={
                            cooperative.isActive
                              ? 'cooperatives-table__switch cooperatives-table__switch--on'
                              : 'cooperatives-table__switch'
                          }
                          disabled={busyId === cooperative.id}
                          onClick={() => void handleToggleStatus(cooperative)}
                          role="switch"
                          type="button"
                        />
                      </div>
                    </td>
                    <td>
                      <div className="cooperatives-table__actions">
                        <button
                          aria-label={`Editar ${cooperative.name}`}
                          disabled={busyId === cooperative.id}
                          onClick={() => setDialog({ mode: 'edit', cooperative })}
                          type="button"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 20h4.2L19 9.2a1.5 1.5 0 0 0 0-2.1L16.9 5a1.5 1.5 0 0 0-2.1 0L4 15.8V20Z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          aria-label={`Eliminar ${cooperative.name}`}
                          className="cooperatives-table__action--danger"
                          disabled={busyId === cooperative.id}
                          onClick={() => void handleDelete(cooperative)}
                          type="button"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          aria-label={`Ver ${cooperative.name}`}
                          onClick={() => setDialog({ mode: 'view', cooperative })}
                          type="button"
                        >
                          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
                              stroke="currentColor"
                              strokeWidth="1.7"
                            />
                            <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
                          </svg>
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
        <CooperativeDialog
          key={
            dialog.mode === 'create'
              ? 'create'
              : `${dialog.mode}-${dialog.cooperative.id}`
          }
          mode={dialog.mode}
          cooperative={dialog.mode === 'create' ? undefined : dialog.cooperative}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
