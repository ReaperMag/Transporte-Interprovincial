import type { TripCity } from '../services/trip.service';

export const HISTORICAL_LOCATION_GROUP = '__historical__';

export function normalizeGeographicSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');
}

export interface SearchLocation extends TripCity {
  parentCanton: string;
  isHistorical: boolean;
}

export interface PassengerCanton {
  id: string;
  name: string;
  province: string;
}

interface PassengerLocationFilterProps {
  classPrefix: 'passenger-trip-search' | 'passenger-dashboard';
  label: string;
  provinces: string[];
  cantons: PassengerCanton[];
  locations: SearchLocation[];
  province: string;
  canton: string;
  search: string;
  value: string;
  excludedCityId: string;
  disabled: boolean;
  onProvinceChange: (value: string) => void;
  onCantonChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onValueChange: (value: string) => void;
}

export function PassengerLocationFilter({
  classPrefix,
  label,
  provinces,
  cantons,
  locations,
  province,
  canton,
  search,
  value,
  excludedCityId,
  disabled,
  onProvinceChange,
  onCantonChange,
  onSearchChange,
  onValueChange,
}: PassengerLocationFilterProps) {
  const availableCantons = cantons.filter((item) => item.province === province);
  const hasHistoricalLocations = locations.some(
    (item) => item.province === province && item.parentCanton === HISTORICAL_LOCATION_GROUP,
  );
  const query = normalizeGeographicSearch(search);
  const availableLocations = locations.filter((item) => {
    const normalizedName = normalizeGeographicSearch(item.name);
    return (
      item.province === province &&
      item.parentCanton === canton &&
      String(item.id) !== excludedCityId &&
      (!query || normalizedName.includes(query))
    );
  });

  return (
    <fieldset className={`${classPrefix}__location-filter`}>
      <legend>{label}</legend>
      <div className={`${classPrefix}__location-fields`}>
        <label className={`${classPrefix}__filter-field`}>
          <span>Provincia</span>
          <select
            value={province}
            onChange={(event) => onProvinceChange(event.target.value)}
            disabled={disabled}
          >
            <option value="">Selecciona una provincia</option>
            {provinces.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className={`${classPrefix}__filter-field`}>
          <span>Cantón</span>
          <select
            value={canton}
            onChange={(event) => onCantonChange(event.target.value)}
            disabled={disabled || !province}
          >
            <option value="">Selecciona un cantón</option>
            {availableCantons.map((item) => (
              <option value={item.name} key={item.id}>
                {item.name}
              </option>
            ))}
            {hasHistoricalLocations && (
              <option value={HISTORICAL_LOCATION_GROUP}>Ubicaciones históricas</option>
            )}
          </select>
        </label>

        <label className={`${classPrefix}__filter-field`}>
          <span>Buscar localidad</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            disabled={disabled || !canton}
            placeholder="Escribe el nombre"
          />
        </label>

        <label className={`${classPrefix}__filter-field`}>
          <span>Localidad</span>
          <select
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            disabled={disabled || !canton}
          >
            <option value="">Todas las localidades</option>
            {availableLocations.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
                {item.isHistorical ? ' — ubicación histórica' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
