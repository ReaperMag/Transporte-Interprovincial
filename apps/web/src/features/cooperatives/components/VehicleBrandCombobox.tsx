import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import type { CooperativeVehicleCatalogItem } from '../services/cooperativeVehicleCatalog.service';

import './VehicleBrandCombobox.css';

interface VehicleBrandComboboxProps {
  label: string;
  items: CooperativeVehicleCatalogItem[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder: string;
  historicalName?: string;
  disabled?: boolean;
}

export function VehicleBrandCombobox({
  label,
  items,
  value,
  onChange,
  placeholder,
  historicalName,
  disabled = false,
}: VehicleBrandComboboxProps) {
  const listId = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedItem = items.find((item) => item.id === value);

  const filteredItems = items.filter((item) =>
    item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );

  const displayValue =
    selectedItem?.name ??
    (value !== null
      ? historicalName
        ? `${historicalName} (fuera del catálogo)`
        : 'Marca no disponible'
      : historicalName
        ? `Sin vínculo (histórico: ${historicalName})`
        : placeholder);

  // Cerrar el menú al hacer clic fuera del componente.
  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);

    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
    };
  }, [open]);

  // Enfocar automáticamente el buscador.
  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    }
  }, [open]);

  const openMenu = () => {
    if (disabled) return;

    const rect = rootRef.current?.getBoundingClientRect();

    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Si no hay espacio abajo, abrir hacia arriba.
      setOpenAbove(spaceBelow < 250 && spaceAbove > spaceBelow);

      // Evitar que el menú sobresalga por la derecha.
      setAlignRight(rect.left + 280 > window.innerWidth - 16);
    }

    setSearch('');
    setActiveIndex(0);
    setOpen(true);
  };

  const closeMenu = () => {
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  const chooseItem = (item: CooperativeVehicleCatalogItem) => {
    onChange(item.id);
    closeMenu();
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      if (filteredItems.length > 0) {
        setActiveIndex((current) => Math.min(current + 1, filteredItems.length - 1));
      }

      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      setActiveIndex((current) => Math.max(current - 1, 0));

      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      const selected = filteredItems[activeIndex];

      if (selected) {
        chooseItem(selected);
      }
    }
  };

  const panelClassName = [
    'vehicle-brand-combobox__panel',
    openAbove ? 'vehicle-brand-combobox__panel--above' : '',
    alignRight ? 'vehicle-brand-combobox__panel--right' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="vehicle-brand-combobox" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="vehicle-brand-combobox__trigger"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        title={displayValue}
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            openMenu();
          }
        }}
      >
        <span className="vehicle-brand-combobox__value">{displayValue}</span>

        <span className="vehicle-brand-combobox__arrow" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className={panelClassName}>
          <input
            ref={searchRef}
            type="search"
            className="vehicle-brand-combobox__search"
            placeholder="Buscar marca..."
            aria-label={`Buscar ${label.toLowerCase()}`}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              filteredItems[activeIndex]
                ? `${listId}-option-${filteredItems[activeIndex].id}`
                : undefined
            }
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyboard}
          />

          <div
            id={listId}
            className="vehicle-brand-combobox__options"
            role="listbox"
            aria-label={label}
          >
            {filteredItems.length > 0 ? (
              filteredItems.map((item, index) => (
                <button
                  key={item.id}
                  id={`${listId}-option-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  className={
                    'vehicle-brand-combobox__option' +
                    (item.id === value ? ' vehicle-brand-combobox__option--selected' : '') +
                    (index === activeIndex ? ' vehicle-brand-combobox__option--active' : '')
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => chooseItem(item)}
                >
                  {item.name}
                </button>
              ))
            ) : (
              <p className="vehicle-brand-combobox__empty">No se encontraron marcas.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
