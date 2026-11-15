import type { GeographicCatalog } from '../../geography/services/geographicCatalog.service';

export interface RouteLocationFilterValue {
  province: string;
  canton: string;
  locality: string;
}

interface RouteLocationFilterProps {
  title: string;
  catalog: GeographicCatalog | null;
  value: RouteLocationFilterValue;
  onChange: (value: RouteLocationFilterValue) => void;
}

export function RouteLocationFilter({
  title,
  catalog,
  value,
  onChange,
}: RouteLocationFilterProps) {
  const cantons = (catalog?.cantons ?? []).filter((item) => item.province === value.province);
  const localities = (catalog?.localities ?? []).filter(
    (item) => item.province === value.province && item.canton === value.canton,
  );

  return (
    <fieldset className="cooperative-routes__location-filter">
      <legend>{title}</legend>
      <div className="cooperative-routes__location-filter-fields">
        <label>
          Provincia
          <select
            value={value.province}
            onChange={(event) =>
              onChange({ province: event.target.value, canton: '', locality: '' })
            }
          >
            <option value="">Todas las provincias</option>
            {(catalog?.provinces ?? []).map((province) => (
              <option value={province} key={province}>
                {province}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cantón
          <select
            value={value.canton}
            onChange={(event) =>
              onChange({ ...value, canton: event.target.value, locality: '' })
            }
            disabled={!value.province}
          >
            <option value="">Todos los cantones</option>
            {cantons.map((canton) => (
              <option value={canton.name} key={canton.id}>
                {canton.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Localidad
          <select
            value={value.locality}
            onChange={(event) => onChange({ ...value, locality: event.target.value })}
            disabled={!value.canton}
          >
            <option value="">Todas las localidades</option>
            {localities.map((locality) => (
              <option value={locality.id} key={locality.id}>
                {locality.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
