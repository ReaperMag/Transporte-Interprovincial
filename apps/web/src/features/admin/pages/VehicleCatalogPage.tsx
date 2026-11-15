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

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

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
  const [customCountry, setCustomCountry] = useState('');
  const [editing, setEditing] = useState<VehicleCatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    item: VehicleCatalogItem;
    kind: VehicleCatalogKind;
  } | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    if (activeKind === 'bodyworks') {
      return catalog?.bodyworkLocations ?? [];
    }
    const values = (catalog?.[activeKind] ?? [])
      .map((item) => item.originCountry)
      .filter((value): value is string => Boolean(value));
    return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'es'));
  }, [activeKind, catalog]);

  const items = useMemo(() => {
    const query = normalizeSearch(search);
    return (catalog?.[activeKind] ?? []).filter((item) => {
      const searchableText = normalizeSearch(
        [item.name, activeKind === 'chassis' ? item.originCountry : item.location]
          .filter(Boolean)
          .join(' '),
      );
      return (
        (!query || searchableText.includes(query)) &&
        (!metadataFilter ||
          (activeKind === 'chassis'
            ? item.originCountry === metadataFilter
            : item.location
                ?.split('/')
                .map((location) => location.trim())
                .includes(metadataFilter)))
      );
    });
  }, [activeKind, catalog, metadataFilter, search]);

  const openCreate = () => {
    setIsFormOpen(true);
    setEditing(null);
    setName('');
    setImageUrl('');
    setMetadata('');
    setCustomCountry('');
    setError(null);
    setFormError(null);
    setNotice(null);
  };

  const openEdit = (item: VehicleCatalogItem) => {
    setIsFormOpen(true);
    setEditing(item);
    setName(item.name);
    setImageUrl(item.imageUrl ?? '');
    setMetadata(activeKind === 'chassis' ? (item.originCountry ?? '') : (item.location ?? ''));
    setCustomCountry('');
    setError(null);
    setFormError(null);
    setNotice(null);
  };

  const closeForm = () => {
    if (!saving) {
      setIsFormOpen(false);
      setEditing(null);
      setName('');
      setImageUrl('');
      setMetadata('');
      setCustomCountry('');
      setFormError(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setFormError('Escribe el nombre de la marca.');
      return;
    }
    const originCountry = customCountry.trim() || metadata.trim();
    if (activeKind === 'chassis' && !originCountry) {
      setFormError('Selecciona un país de origen o escribe uno nuevo.');
      return;
    }
    if (activeKind === 'bodyworks' && !metadata.trim()) {
      setFormError('Selecciona la ciudad de origen de la carrocería.');
      return;
    }
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const saved = editing
        ? await updateVehicleCatalogItem(
            activeKind,
            editing.id,
            value,
            imageUrl.trim(),
            activeKind === 'chassis' ? originCountry : undefined,
            activeKind === 'bodyworks' ? metadata : undefined,
          )
        : await createVehicleCatalogItem(
            activeKind,
            value,
            imageUrl.trim(),
            activeKind === 'chassis' ? originCountry : undefined,
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
      setFormError(
        requestError instanceof Error ? requestError.message : 'No se pudo guardar la marca.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    const { item, kind } = deleteTarget;
    setIsDeleting(true);
    setDeleteError(null);
    setNotice(null);
    try {
      await deleteVehicleCatalogItem(kind, item.id);
      setCatalog((current) =>
        current
          ? {
              ...current,
              [kind]: current[kind].filter((entry) => entry.id !== item.id),
            }
          : current,
      );
      setNotice('Marca eliminada correctamente.');
      setDeleteTarget(null);
    } catch (requestError: unknown) {
      setDeleteError(
        requestError instanceof Error ? requestError.message : 'No se pudo eliminar la marca.',
      );
    } finally {
      setIsDeleting(false);
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
            <p>
              Consulta las marcas con su {activeKind === 'chassis' ? 'país de origen' : 'ciudad'}.
            </p>
          </div>
          <button className="vehicle-catalog__add" onClick={openCreate} type="button">
            <span>+</span> Agregar marca
          </button>
        </header>

        <div className="vehicle-catalog__filters">
          <label>
            <span>Buscar marca o {activeKind === 'chassis' ? 'país' : 'ciudad'}</span>
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
                <th>{activeKind === 'chassis' ? 'País de origen' : 'Ciudad o cantón'}</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="vehicle-catalog__empty">
                    Cargando el cat\u00e1logo...
                  </td>
                </tr>
              ) : items.length ? (
                items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="vehicle-catalog__brand">
                        <BrandLogo item={item} />
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="vehicle-catalog__metadata">
                        {activeKind === 'chassis'
                          ? (item.originCountry ?? 'País no registrado')
                          : (item.location ?? 'Ubicación no registrada')}
                      </span>
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
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget({ item, kind: activeKind });
                          }}
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
                  <td colSpan={3} className="vehicle-catalog__empty">
                    No hay marcas que coincidan con la busqueda.
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
            <form noValidate onSubmit={(event) => void handleSubmit(event)}>
              {formError && (
                <p className="vehicle-catalog__form-error" role="alert">
                  {formError}
                </p>
              )}
              <label>
                <span>Nombre de la marca</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setFormError(null);
                  }}
                  maxLength={150}
                  placeholder={activeKind === 'chassis' ? 'Ej. Hino' : 'Ej. Carrocerías Cepeda'}
                />
              </label>
              {activeKind === 'chassis' && (
                <>
                  <label>
                    <span>País de origen</span>
                    <select
                      value={metadata}
                      onChange={(event) => {
                        setMetadata(event.target.value);
                        setCustomCountry('');
                        setFormError(null);
                      }}
                      required={!customCountry.trim()}
                    >
                      <option value="">Selecciona un país</option>
                      {metadataOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!editing && (
                    <label>
                      <span>O agrega un país al catálogo</span>
                      <input
                        value={customCountry}
                        onChange={(event) => {
                          setCustomCountry(event.target.value);
                          if (event.target.value) setMetadata('');
                          setFormError(null);
                        }}
                        maxLength={100}
                        placeholder="Escribe el nombre del país"
                      />
                    </label>
                  )}
                </>
              )}
              {activeKind === 'bodyworks' && (
                <label>
                  <span>Ciudad o cantón</span>
                  <select
                    value={metadata}
                    onChange={(event) => {
                      setMetadata(event.target.value);
                      setFormError(null);
                    }}
                    required
                  >
                    <option value="">Selecciona una ubicación</option>
                    {editing && metadata && !metadataOptions.includes(metadata) && (
                      <option value={metadata}>{metadata}</option>
                    )}
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
                    La imagen se mostrará a la izquierda de la marca.
                  </small>
                </label>
              )}
              <p>
                {activeKind === 'chassis'
                  ? 'El país de origen se guarda junto con la marca del chasis.'
                  : 'La ciudad de fabricación se guarda junto con la marca de la carrocería.'}
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

      {deleteTarget && (
        <div className="vehicle-catalog__backdrop">
          <section
            className="vehicle-catalog__dialog vehicle-catalog__delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vehicle-delete-title"
            aria-describedby="vehicle-delete-description"
          >
            <header>
              <div>
                <span>Confirmación requerida</span>
                <h2 id="vehicle-delete-title">Eliminar marca</h2>
              </div>
            </header>
            <div className="vehicle-catalog__delete-summary">
              <BrandLogo item={deleteTarget.item} />
              <div>
                <strong>{deleteTarget.item.name}</strong>
                <span>
                  {deleteTarget.kind === 'chassis'
                    ? `País: ${deleteTarget.item.originCountry ?? 'No registrado'}`
                    : `Ciudad: ${deleteTarget.item.location ?? 'No registrada'}`}
                </span>
              </div>
            </div>
            <p id="vehicle-delete-description">
              ¿Confirmas que deseas eliminar esta marca del catálogo? Esta acción no se puede
              deshacer.
            </p>
            {deleteError && (
              <p className="vehicle-catalog__delete-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="vehicle-catalog__dialog-actions">
              <button
                autoFocus
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="is-danger"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                type="button"
              >
                {isDeleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
