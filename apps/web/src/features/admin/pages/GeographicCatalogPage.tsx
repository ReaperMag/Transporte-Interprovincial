import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createCanton,
  createLocality,
  getGeographicCatalog,
  type GeographicPlace,
  type GeographicCatalog,
} from '../../geography/services/geographicCatalog.service';
import './GeographicCatalogPage.css';

type CatalogView = 'cantons' | 'localities';

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

function sortCantons(cantons: GeographicPlace[], provinces: string[]): GeographicPlace[] {
  const provinceOrder = new Map(provinces.map((province, index) => [province, index]));
  return [...cantons].sort(
    (left, right) =>
      (provinceOrder.get(left.province) ?? Number.MAX_SAFE_INTEGER) -
        (provinceOrder.get(right.province) ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name, 'es'),
  );
}

export function GeographicCatalogPage() {
  const [catalog, setCatalog] = useState<GeographicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<CatalogView>('cantons');
  const [search, setSearch] = useState('');
  const [cantonName, setCantonName] = useState('');
  const [localityName, setLocalityName] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [localityProvince, setLocalityProvince] = useState('');
  const [localityCanton, setLocalityCanton] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [cantonFilter, setCantonFilter] = useState('');
  const [isAddCantonOpen, setIsAddCantonOpen] = useState(false);
  const [isAddLocalityOpen, setIsAddLocalityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getGeographicCatalog(controller.signal)
      .then((result) => {
        setCatalog(result);
        setSelectedProvince(result.provinces[0] ?? '');
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo cargar el catálogo geográfico.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const visibleCantons = useMemo(() => {
    if (!catalog) return [];
    const query = normalizeSearch(search);
    return sortCantons(catalog.cantons, catalog.provinces).filter(
      (canton) =>
        (!provinceFilter || canton.province === provinceFilter) &&
        (!query || normalizeSearch(canton.name).includes(query)),
    );
  }, [catalog, provinceFilter, search]);

  const filterCantons = useMemo(
    () =>
      catalog?.cantons.filter((canton) => !provinceFilter || canton.province === provinceFilter) ??
      [],
    [catalog, provinceFilter],
  );

  const visibleLocalities = useMemo(() => {
    if (!catalog) return [];
    const query = normalizeSearch(search);
    const selectedCanton = catalog.cantons.find((canton) => String(canton.id) === cantonFilter);
    const provinceOrder = new Map(catalog.provinces.map((province, index) => [province, index]));
    return [...catalog.localities]
      .filter(
        (locality) =>
          (!provinceFilter || locality.province === provinceFilter) &&
          (!cantonFilter ||
            (selectedCanton !== undefined &&
              locality.canton === selectedCanton.name &&
              locality.province === selectedCanton.province)) &&
          (!query || normalizeSearch(locality.name).includes(query)),
      )
      .sort(
        (left, right) =>
          (provinceOrder.get(left.province) ?? Number.MAX_SAFE_INTEGER) -
            (provinceOrder.get(right.province) ?? Number.MAX_SAFE_INTEGER) ||
          (left.canton ?? '').localeCompare(right.canton ?? '', 'es') ||
          left.name.localeCompare(right.name, 'es'),
      );
  }, [catalog, cantonFilter, provinceFilter, search]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProvince) {
      setFormError('Selecciona una provincia para registrar el cantón.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const canton = await createCanton({
        name: cantonName.trim(),
        province: selectedProvince,
      });
      setCatalog((current) =>
        current
          ? {
              ...current,
              cantons: sortCantons([...current.cantons, canton], current.provinces),
            }
          : current,
      );
      setCantonName('');
      setIsAddCantonOpen(false);
      setSuccess(`${canton.name} se agregó a la provincia ${canton.province}.`);
    } catch (requestError: unknown) {
      setFormError(
        requestError instanceof Error ? requestError.message : 'No se pudo registrar el cantón.',
      );
    } finally {
      setSaving(false);
    }
  };

  const closeAddCantonDialog = () => {
    if (saving) return;
    setIsAddCantonOpen(false);
    setCantonName('');
    setFormError(null);
  };

  const handleLocalitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localityProvince || !localityCanton) {
      setFormError('Selecciona la provincia y el cantón de la localidad.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const locality = await createLocality({
        name: localityName.trim(),
        province: localityProvince,
        canton: localityCanton,
      });
      setCatalog((current) =>
        current
          ? {
              ...current,
              localities: [...current.localities, locality],
            }
          : current,
      );
      setLocalityName('');
      setIsAddLocalityOpen(false);
      setSuccess(
        `${locality.name} se agregó al cantón ${locality.canton} de ${locality.province}.`,
      );
    } catch (requestError: unknown) {
      setFormError(
        requestError instanceof Error ? requestError.message : 'No se pudo registrar la localidad.',
      );
    } finally {
      setSaving(false);
    }
  };

  const closeAddLocalityDialog = () => {
    if (saving) return;
    setIsAddLocalityOpen(false);
    setLocalityName('');
    setFormError(null);
  };

  return (
    <section className="geographic-catalog" aria-labelledby="geographic-catalog-title">
      <header className="geographic-catalog__hero">
        <div>
          <p className="geographic-catalog__eyebrow">Administración del sistema</p>
          <h1 id="geographic-catalog-title">Catálogo geográfico del Ecuador</h1>
          <p>
            Administra provincias, cantones y localidades para mantener las rutas estandarizadas.
          </p>
        </div>
        <div className="geographic-catalog__hero-art" aria-hidden="true">
          <svg viewBox="0 0 180 150" fill="none">
            <path
              d="m18 37 37-20 35 17 34-18 40 22v89l-38 17-36-17-35 18-37-20V37Z"
              stroke="white"
              strokeOpacity=".78"
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M55 17v88m35-71v73m34-91v109M27 51l27-14 35 18 35-18 31 16"
              stroke="white"
              strokeOpacity=".62"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <circle cx="89" cy="69" r="10" fill="#f0c46d" />
          </svg>
        </div>
      </header>

      <div className="geographic-catalog__stats" aria-label="Resumen del catálogo">
        <article className="geographic-catalog__stat">
          <span className="geographic-catalog__stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 20V5l8-3 8 3v15M8 9h1m6 0h1M8 13h1m6 0h1M10 20v-4h4v4" />
            </svg>
          </span>
          <span>
            <small>Provincias</small>
            <strong>{loading ? '—' : (catalog?.provinces.length ?? 0)}</strong>
          </span>
        </article>
        <article className="geographic-catalog__stat">
          <span className="geographic-catalog__stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1m4 0h1M9 14h1m4 0h1" />
            </svg>
          </span>
          <span>
            <small>Cantones registrados</small>
            <strong>{loading ? '—' : (catalog?.cantons.length ?? 0)}</strong>
          </span>
        </article>
        <article className="geographic-catalog__stat">
          <span className="geographic-catalog__stat-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z" />
              <circle cx="12" cy="10" r="2.2" />
            </svg>
          </span>
          <span>
            <small>Localidades registradas</small>
            <strong>{loading ? '—' : (catalog?.localities.length ?? 0)}</strong>
          </span>
        </article>
      </div>

      {error && (
        <p className="geographic-catalog__notice geographic-catalog__notice--error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="geographic-catalog__notice geographic-catalog__notice--success" role="status">
          {success}
        </p>
      )}

      <section className="geographic-catalog__panel" aria-labelledby="geographic-list-title">
        <header className="geographic-catalog__list-header">
          <div
            className="geographic-catalog__view-switch"
            role="group"
            aria-label="Tipo de catálogo"
          >
            <button
              aria-pressed={activeView === 'cantons'}
              className={activeView === 'cantons' ? 'is-active' : ''}
              onClick={() => {
                setActiveView('cantons');
                setCantonFilter('');
              }}
              type="button"
            >
              Provincias → cantones
            </button>
            <button
              aria-pressed={activeView === 'localities'}
              className={activeView === 'localities' ? 'is-active' : ''}
              onClick={() => {
                setActiveView('localities');
                setCantonFilter('');
              }}
              type="button"
            >
              Cantones → localidades
            </button>
          </div>
          <div className="geographic-catalog__list-heading">
            <div className="geographic-catalog__list-title">
              <span className="geographic-catalog__section-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
                  <circle cx="12" cy="10" r="2.5" />
                </svg>
              </span>
              <div>
                <h2 id="geographic-list-title">
                  {activeView === 'cantons' ? 'Cantones registrados' : 'Localidades registradas'}
                </h2>
                <p>
                  {activeView === 'cantons'
                    ? 'Filtra por provincia o busca un cantón por nombre.'
                    : 'Filtra por provincia y cantón, o busca una localidad por nombre.'}
                </p>
              </div>
            </div>
            <button
              className="geographic-catalog__add-button"
              disabled={loading || !catalog}
              onClick={() => {
                setFormError(null);
                setSuccess(null);
                if (activeView === 'cantons') {
                  setSelectedProvince(provinceFilter || catalog?.provinces[0] || '');
                  setIsAddCantonOpen(true);
                } else {
                  const defaultProvince = provinceFilter || catalog?.provinces[0] || '';
                  const filteredCanton = catalog?.cantons.find(
                    (canton) => String(canton.id) === cantonFilter,
                  );
                  const defaultCanton =
                    (filteredCanton?.province === defaultProvince ? filteredCanton.name : '') ||
                    catalog?.cantons.find((canton) => canton.province === defaultProvince)?.name ||
                    '';
                  setLocalityProvince(defaultProvince);
                  setLocalityCanton(defaultCanton);
                  setIsAddLocalityOpen(true);
                }
              }}
              type="button"
            >
              <span aria-hidden="true">+</span>
              {activeView === 'cantons' ? 'Agregar cantón' : 'Agregar localidad'}
            </button>
          </div>
          <div
            className={`geographic-catalog__filters${activeView === 'localities' ? ' geographic-catalog__filters--localities' : ''}`}
            role="group"
            aria-label={`Filtros de ${activeView === 'cantons' ? 'cantones' : 'localidades'}`}
          >
            <label className="geographic-catalog__search">
              <span>
                Buscar por nombre {activeView === 'cantons' ? 'del cantón' : 'de la localidad'}
              </span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder={activeView === 'cantons' ? 'Nombre del cantón' : 'Nombre de localidad'}
                type="search"
                value={search}
              />
            </label>
            <label>
              <span>Provincia</span>
              <select
                disabled={loading || !catalog}
                onChange={(event) => {
                  setProvinceFilter(event.target.value);
                  setCantonFilter('');
                }}
                value={provinceFilter}
              >
                <option value="">Todas las provincias</option>
                {catalog?.provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            {activeView === 'localities' && (
              <label>
                <span>Cantón</span>
                <select
                  disabled={loading || !catalog}
                  onChange={(event) => setCantonFilter(event.target.value)}
                  value={cantonFilter}
                >
                  <option value="">Todos los cantones</option>
                  {filterCantons.map((canton) => (
                    <option key={canton.id} value={canton.id}>
                      {canton.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </header>

        <div className="geographic-catalog__table-wrap">
          <table className="geographic-catalog__table">
            <thead>
              <tr>
                {activeView === 'cantons' ? (
                  <>
                    <th scope="col">Cantón</th>
                    <th scope="col">Provincia</th>
                  </>
                ) : (
                  <>
                    <th scope="col">Localidad</th>
                    <th scope="col">Cantón</th>
                    <th scope="col">Provincia</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="geographic-catalog__table-message"
                    colSpan={activeView === 'cantons' ? 2 : 3}
                  >
                    Cargando el catálogo...
                  </td>
                </tr>
              ) : activeView === 'cantons' && visibleCantons.length ? (
                visibleCantons.map((canton) => (
                  <tr key={canton.id}>
                    <td>{canton.name}</td>
                    <td>
                      <span className="geographic-catalog__province-tag">{canton.province}</span>
                    </td>
                  </tr>
                ))
              ) : activeView === 'localities' && visibleLocalities.length ? (
                visibleLocalities.map((locality) => (
                  <tr key={locality.id}>
                    <td>{locality.name}</td>
                    <td>{locality.canton}</td>
                    <td>
                      <span className="geographic-catalog__province-tag">{locality.province}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    className="geographic-catalog__table-message"
                    colSpan={activeView === 'cantons' ? 2 : 3}
                  >
                    {error
                      ? 'No fue posible cargar el catálogo.'
                      : `No hay ${activeView === 'cantons' ? 'cantones' : 'localidades'} que coincidan con la búsqueda.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && (
          <p className="geographic-catalog__result-count">
            {activeView === 'cantons'
              ? `${visibleCantons.length} de ${catalog?.cantons.length ?? 0} cantones`
              : `${visibleLocalities.length} de ${catalog?.localities.length ?? 0} localidades`}
          </p>
        )}
      </section>

      {isAddCantonOpen && (
        <div className="geographic-catalog__backdrop">
          <section
            aria-labelledby="geographic-dialog-title"
            aria-modal="true"
            className="geographic-catalog__dialog"
            role="dialog"
          >
            <header className="geographic-catalog__dialog-header">
              <div>
                <span>Administración territorial</span>
                <h2 id="geographic-dialog-title">Agregar cantón</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="geographic-catalog__dialog-close"
                disabled={saving}
                onClick={closeAddCantonDialog}
                type="button"
              >
                ×
              </button>
            </header>

            <form
              className="geographic-catalog__dialog-form"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <label>
                <span>Provincia</span>
                <select
                  autoFocus
                  disabled={saving || !catalog?.provinces.length}
                  onChange={(event) => setSelectedProvince(event.target.value)}
                  required
                  value={selectedProvince}
                >
                  {catalog?.provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Nombre del cantón</span>
                <input
                  autoComplete="off"
                  maxLength={100}
                  onChange={(event) => {
                    setCantonName(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="Ej.: Nuevo cantón"
                  required
                  value={cantonName}
                />
              </label>
              <p className="geographic-catalog__dialog-hint">
                El cantón quedará disponible para seleccionarlo al planificar rutas.
              </p>
              {formError && (
                <p className="geographic-catalog__dialog-error" role="alert">
                  {formError}
                </p>
              )}
              <footer className="geographic-catalog__dialog-actions">
                <button
                  className="geographic-catalog__dialog-cancel"
                  disabled={saving}
                  onClick={closeAddCantonDialog}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="geographic-catalog__dialog-save" disabled={saving} type="submit">
                  {saving ? 'Guardando...' : 'Agregar cantón'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {isAddLocalityOpen && (
        <div className="geographic-catalog__backdrop">
          <section
            aria-labelledby="geographic-locality-dialog-title"
            aria-modal="true"
            className="geographic-catalog__dialog"
            role="dialog"
          >
            <header className="geographic-catalog__dialog-header">
              <div>
                <span>Administración territorial</span>
                <h2 id="geographic-locality-dialog-title">Agregar localidad</h2>
              </div>
              <button
                aria-label="Cerrar"
                className="geographic-catalog__dialog-close"
                disabled={saving}
                onClick={closeAddLocalityDialog}
                type="button"
              >
                ×
              </button>
            </header>

            <form
              className="geographic-catalog__dialog-form"
              onSubmit={(event) => void handleLocalitySubmit(event)}
            >
              <label>
                <span>Provincia</span>
                <select
                  autoFocus
                  disabled={saving || !catalog?.provinces.length}
                  onChange={(event) => {
                    setLocalityProvince(event.target.value);
                    setLocalityCanton('');
                  }}
                  required
                  value={localityProvince}
                >
                  {catalog?.provinces.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Cantón</span>
                <select
                  disabled={saving || !localityProvince}
                  onChange={(event) => setLocalityCanton(event.target.value)}
                  required
                  value={localityCanton}
                >
                  <option value="">Selecciona un cantón</option>
                  {catalog?.cantons
                    .filter((canton) => canton.province === localityProvince)
                    .map((canton) => (
                      <option key={canton.id} value={canton.name}>
                        {canton.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Nombre de la localidad</span>
                <input
                  autoComplete="off"
                  maxLength={100}
                  onChange={(event) => {
                    setLocalityName(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="Ej.: San José"
                  required
                  value={localityName}
                />
              </label>
              <p className="geographic-catalog__dialog-hint">
                La localidad quedará disponible para seleccionarla al planificar rutas.
              </p>
              {formError && (
                <p className="geographic-catalog__dialog-error" role="alert">
                  {formError}
                </p>
              )}
              <footer className="geographic-catalog__dialog-actions">
                <button
                  className="geographic-catalog__dialog-cancel"
                  disabled={saving}
                  onClick={closeAddLocalityDialog}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="geographic-catalog__dialog-save" disabled={saving} type="submit">
                  {saving ? 'Guardando...' : 'Agregar localidad'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
