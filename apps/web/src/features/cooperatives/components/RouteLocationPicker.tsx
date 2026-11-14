import type { GeographicPlace } from '../../geography/services/geographicCatalog.service';
import { normalizeLocationSearch } from '../utils/normalizeLocationSearch';

interface RouteLocationPickerProps {
  title: string;
  provinces: string[];
  cantons: GeographicPlace[];
  localities: GeographicPlace[];
  province: string;
  canton: string;
  search: string;
  value: string;
  excludedIds?: string[];
  onProvinceChange: (value: string) => void;
  onCantonChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
}

export function RouteLocationPicker({
  title,
  provinces,
  cantons,
  localities,
  province,
  canton,
  search,
  value,
  excludedIds = [],
  onProvinceChange,
  onCantonChange,
  onSearchChange,
  onValueChange,
}: RouteLocationPickerProps) {
  const filteredCantons = cantons.filter((item) => item.province === province);
  const query = normalizeLocationSearch(search);
  const filteredLocalities = localities.filter(
    (item) =>
      item.province === province &&
      item.canton === canton &&
      !excludedIds.includes(String(item.id)) &&
      (!query || normalizeLocationSearch(item.name).includes(query)),
  );

  return (
    <fieldset className="cooperative-routes__location-picker">
      <legend>{title}</legend>
      <div className="cooperative-routes__location-fields">
        <label>
          Provincia
          <select
            value={province}
            onChange={(event) => onProvinceChange(event.target.value)}
            required
          >
            <option value="">Selecciona provincia</option>
            {provinces.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Cantón
          <select
            value={canton}
            onChange={(event) => onCantonChange(event.target.value)}
            disabled={!province}
            required
          >
            <option value="">Selecciona cantón</option>
            {filteredCantons.map((item) => (
              <option value={item.name} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Buscar localidad
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            disabled={!canton}
            placeholder="Escribe el nombre"
          />
        </label>
        <label>
          Localidad
          <select
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            disabled={!canton}
            required
          >
            <option value="">Selecciona localidad</option>
            {filteredLocalities.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
