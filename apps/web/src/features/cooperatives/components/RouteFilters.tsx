import type { CooperativeBusGroup } from '../services/busGroup.service';

export type RouteStatusFilter = 'all' | 'active' | 'inactive';

interface RouteFiltersProps {
  search: string;
  group: string;
  status: RouteStatusFilter;
  groups: CooperativeBusGroup[];
  onSearchChange: (value: string) => void;
  onGroupChange: (value: string) => void;
  onStatusChange: (value: RouteStatusFilter) => void;
}

export function RouteFilters({
  search,
  group,
  status,
  groups,
  onSearchChange,
  onGroupChange,
  onStatusChange,
}: RouteFiltersProps) {
  return (
    <div className="cooperative-routes__filters" role="search" aria-label="Filtrar rutas">
      <label>
        Buscar ruta
        <input
          type="search"
          value={search}
          placeholder="Ciudad, parada o grupo"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <label>
        Grupo de buses
        <select value={group} onChange={(event) => onGroupChange(event.target.value)}>
          <option value="all">Todos los grupos</option>
          <option value="none">Sin grupo</option>
          {groups.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estado
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value as RouteStatusFilter)}
        >
          <option value="all">Todas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </label>
    </div>
  );
}
