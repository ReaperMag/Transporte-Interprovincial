import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createVehicleCatalogItem,
  deleteVehicleCatalogItem,
  getVehicleCatalog,
  updateVehicleCatalogItem,
  type VehicleCatalog,
  type VehicleCatalogItem,
  type VehicleCatalogKind,
} from '../services/vehicleCatalog.service';
import './VehicleCatalogPage.css';

const kindLabels: Record<VehicleCatalogKind, string> = {
  chassis: 'Marcas de chasis',
  bodyworks: 'Marcas de carrocería',
};

export function VehicleCatalogPage() {
  const [catalog, setCatalog] = useState<VehicleCatalog | null>(null);
  const [activeKind, setActiveKind] = useState<VehicleCatalogKind>('chassis');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<VehicleCatalogItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getVehicleCatalog(controller.signal)
      .then(setCatalog)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error ? requestError.message : 'No se pudo cargar el catálogo.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return (catalog?.[activeKind] ?? []).filter((item) =>
      !query ? true : item.name.toLocaleLowerCase('es').includes(query),
    );
  }, [activeKind, catalog, search]);

  const openCreate = () => {
    setIsFormOpen(true);
    setEditing(null);
    setName('');
    setError(null);
    setNotice(null);
  };

  const openEdit = (item: VehicleCatalogItem) => {
    setIsFormOpen(true);
    setEditing(item);
    setName(item.name);
    setError(null);
    setNotice(null);
  };

  const closeForm = () => {
    if (!saving) {
      setEditing(null);
      setName('');
      setIsFormOpen(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError('Escribe el nombre de la marca.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = editing
        ? await updateVehicleCatalogItem(activeKind, editing.id, value)
        : await createVehicleCatalogItem(activeKind, value);
      setCatalog((current) =>
        current
          ? {
              ...current,
              [activeKind]: editing
                ? current[activeKind].map((item) => (item.id === saved.id ? saved : item))
                : [...current[activeKind], saved].sort((left, right) =>
                    left.name.localeCompare(right.name, 'es'),
                  ),
            }
          : current,
      );
      setNotice(editing ? 'Marca actualizada correctamente.' : 'Marca agregada correctamente.');
      closeForm();
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la marca.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: VehicleCatalogItem) => {
    if (!window.confirm(`¿Eliminar la marca “${item.name}”?`)) return;
    setError(null);
    setNotice(null);
    try {
      await deleteVehicleCatalogItem(activeKind, item.id);
      setCatalog((current) =>
        current
          ? {
              ...current,
              [activeKind]: current[activeKind].filter((entry) => entry.id !== item.id),
            }
          : current,
      );
      setNotice('Marca eliminada correctamente.');
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : 'No se pudo eliminar la marca.',
      );
    }
  };

  return (
    <section className="vehicle-catalog" aria-labelledby="vehicle-catalog-title">
      <header className="vehicle-catalog__hero">
        <div>
          <p className="vehicle-catalog__eyebrow">Catálogo técnico de transporte</p>
          <h1 id="vehicle-catalog-title">Chasis y carrocerías</h1>
          <p>Administra las marcas disponibles para registrar la flota de las cooperativas.</p>
        </div>
        <div className="vehicle-catalog__hero-art" aria-hidden="true">
          ◈
        </div>
      </header>

      <div className="vehicle-catalog__stats">
        <article>
          <span>Chasis</span>
          <strong>{loading ? '—' : (catalog?.chassis.length ?? 0)}</strong>
        </article>
        <article>
          <span>Carrocerías</span>
          <strong>{loading ? '—' : (catalog?.bodyworks.length ?? 0)}</strong>
        </article>
        <article>
          <span>Total de marcas</span>
          <strong>
            {loading ? '—' : (catalog?.chassis.length ?? 0) + (catalog?.bodyworks.length ?? 0)}
          </strong>
        </article>
      </div>

      {error && (
        <p className="vehicle-catalog__notice vehicle-catalog__notice--error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="vehicle-catalog__notice vehicle-catalog__notice--success" role="status">
          {notice}
        </p>
      )}

      <section className="vehicle-catalog__panel" aria-labelledby="vehicle-list-title">
        <div className="vehicle-catalog__switch" role="tablist" aria-label="Tipo de marca">
          {(Object.keys(kindLabels) as VehicleCatalogKind[]).map((kind) => (
            <button
              key={kind}
              className={activeKind === kind ? 'is-active' : ''}
              onClick={() => {
                setActiveKind(kind);
                setSearch('');
                setError(null);
              }}
              role="tab"
              aria-selected={activeKind === kind}
              type="button"
            >
              {kindLabels[kind]}
            </button>
          ))}
        </div>
        <header className="vehicle-catalog__list-header">
          <div>
            <h2 id="vehicle-list-title">{kindLabels[activeKind]}</h2>
            <p>Catálogo global sin ciudades asociadas a las carrocerías.</p>
          </div>
          <button className="vehicle-catalog__add" onClick={openCreate} type="button">
            <span>+</span> Agregar marca
          </button>
        </header>

        <div className="vehicle-catalog__filters">
          <label>
            <span>Buscar marca</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Escribe para filtrar"
            />
          </label>
          <span className="vehicle-catalog__count">
            {items.length} de {catalog?.[activeKind].length ?? 0} marcas
          </span>
        </div>

        <div className="vehicle-catalog__table-wrap">
          <table className="vehicle-catalog__table">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2} className="vehicle-catalog__empty">
                    Cargando el catálogo...
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        {activeKind === 'chassis'
                          ? 'Fabricante de chasis'
                          : 'Fabricante de carrocería'}
                      </small>
                    </td>
                    <td className="vehicle-catalog__actions">
                      <button onClick={() => openEdit(item)} type="button">
                        Editar
                      </button>
                      <button
                        className="is-danger"
                        onClick={() => void handleDelete(item)}
                        type="button"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="vehicle-catalog__empty">
                    No hay marcas que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen && (
        <div className="vehicle-catalog__backdrop">
          <section
            className="vehicle-catalog__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-dialog-title"
          >
            <header>
              <div>
                <span>{editing ? 'Actualizar registro' : 'Nuevo registro'}</span>
                <h2 id="vehicle-dialog-title">{editing ? 'Editar marca' : 'Agregar marca'}</h2>
              </div>
              <button onClick={closeForm} disabled={saving} aria-label="Cerrar" type="button">
                ×
              </button>
            </header>
            <form onSubmit={(event) => void handleSubmit(event)}>
              <label>
                <span>Nombre de la marca</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={150}
                  placeholder={activeKind === 'chassis' ? 'Ej. Hino' : 'Ej. Carrocerías Cepeda'}
                />
              </label>
              <p>
                Solo se registra el nombre de la marca; no se almacenan ciudades ni ubicaciones.
              </p>
              <div className="vehicle-catalog__dialog-actions">
                <button onClick={closeForm} disabled={saving} type="button">
                  Cancelar
                </button>
                <button className="is-primary" disabled={saving} type="submit">
                  {saving ? 'Guardando…' : 'Guardar marca'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
