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
  bodyworks: 'Marcas de carrocer\u00eda',
};

function BrandLogo({ item }: { item: VehicleCatalogItem }) {
  const [hasImageError, setHasImageError] = useState(false);
  const initials = item.name
    .replace(/^Carrocer\u00edas\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  if (item.imageUrl && !hasImageError) {
    return (
      <img
        className="vehicle-catalog__brand-logo vehicle-catalog__brand-logo--image"
        src={item.imageUrl}
        alt={`Logo de ${item.name}`}
        loading="lazy"
        onError={() => setHasImageError(true)}
      />
    );
  }

  return <span className="vehicle-catalog__brand-logo">{initials}</span>;
}

export function VehicleCatalogPage() {
  const [catalog, setCatalog] = useState<VehicleCatalog | null>(null);
  const [activeKind, setActiveKind] = useState<VehicleCatalogKind>('chassis');
  const [search, setSearch] = useState('');
  const [metadataFilter, setMetadataFilter] = useState('');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [metadata, setMetadata] = useState('');
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
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar el cat\u00e1logo.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const metadataOptions = useMemo(() => {
    const values = (catalog?.[activeKind] ?? [])
      .map((item) => (activeKind === 'chassis' ? item.originCountry : item.location))
      .filter((value): value is string => Boolean(value));
    return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'es'));
  }, [activeKind, catalog]);

  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return (catalog?.[activeKind] ?? []).filter(
      (item) =>
        (query ? item.name.toLocaleLowerCase('es').includes(query) : true) &&
        (!metadataFilter ||
          (activeKind === 'chassis' ? item.originCountry : item.location) === metadataFilter),
    );
  }, [activeKind, catalog, metadataFilter, search]);

  const openCreate = () => {
    setIsFormOpen(true);
    setEditing(null);
    setName('');
    setImageUrl('');
    setMetadata('');
    setError(null);
    setNotice(null);
  };

  const openEdit = (item: VehicleCatalogItem) => {
    setIsFormOpen(true);
    setEditing(item);
    setName(item.name);
    setImageUrl(item.imageUrl ?? '');
    setMetadata(activeKind === 'chassis' ? (item.originCountry ?? '') : (item.location ?? ''));
    setError(null);
    setNotice(null);
  };

  const closeForm = () => {
    if (!saving) {
      setIsFormOpen(false);
      setEditing(null);
      setName('');
      setImageUrl('');
      setMetadata('');
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
        ? await updateVehicleCatalogItem(
            activeKind,
            editing.id,
            value,
            imageUrl.trim(),
            activeKind === 'chassis' ? metadata : undefined,
            activeKind === 'bodyworks' ? metadata : undefined,
          )
        : await createVehicleCatalogItem(
            activeKind,
            value,
            imageUrl.trim(),
            activeKind === 'chassis' ? metadata : undefined,
            activeKind === 'bodyworks' ? metadata : undefined,
          );
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
    if (!window.confirm(`\u00bfEliminar la marca \u201c${item.name}\u201d?`)) return;
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
          <span>Carrocer\u00edas</span>
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
                setMetadataFilter('');
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
          <label>
            <span>{activeKind === 'chassis' ? 'País de origen' : 'Ciudad o cantón'}</span>
            <select
              value={metadataFilter}
              onChange={(event) => setMetadataFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {metadataOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
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
                    Cargando el cat\u00e1logo...
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="vehicle-catalog__brand">
                        <BrandLogo item={item} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>
                            {activeKind === 'chassis'
                              ? `Fabricante de chasis · ${item.originCountry ?? 'País no registrado'}`
                              : `Fabricante de carrocer\u00eda · ${item.location ?? 'Ubicación no registrada'}`}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="vehicle-catalog__actions">
                        <button
                          aria-label={`Editar ${item.name}`}
                          title="Editar"
                          onClick={() => openEdit(item)}
                          type="button"
                        >
                          <span aria-hidden="true">✎</span>
                          <span>Editar</span>
                        </button>
                        <button
                          aria-label={`Eliminar ${item.name}`}
                          title="Eliminar"
                          className="is-danger"
                          onClick={() => void handleDelete(item)}
                          type="button"
                        >
                          <span aria-hidden="true">⌫</span>
                          <span>Eliminar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="vehicle-catalog__empty">
                    No hay marcas que coincidan con la b\u00fasqueda.
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
                  placeholder={
                    activeKind === 'chassis' ? 'Ej. Hino' : 'Ej. Carrocer\u00edas Cepeda'
                  }
                />
              </label>
              {activeKind === 'chassis' && (
                <label>
                  <span>País de origen</span>
                  <select
                    value={metadata}
                    onChange={(event) => setMetadata(event.target.value)}
                    required
                  >
                    <option value="">Selecciona un país</option>
                    {metadataOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {activeKind === 'bodyworks' && (
                <label>
                  <span>Ciudad o cantón</span>
                  <select
                    value={metadata}
                    onChange={(event) => setMetadata(event.target.value)}
                    required
                  >
                    <option value="">Selecciona una ubicación</option>
                    {metadataOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {activeKind === 'chassis' && (
                <label>
                  <span>URL del logotipo</span>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                    maxLength={500}
                    placeholder="https://..."
                  />
                  <small className="vehicle-catalog__field-hint">
                    La imagen se mostrar\u00e1 a la izquierda de la marca.
                  </small>
                </label>
              )}
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
