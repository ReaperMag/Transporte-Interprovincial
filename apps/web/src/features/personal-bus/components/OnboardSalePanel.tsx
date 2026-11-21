import { useEffect, useState, type FormEvent } from 'react';
import { cedulaError, cleanName, nameError, onlyDigits } from '../../../shared/utils/validation';
import {
  createOnboardSale,
  getOnboardSaleOptions,
  listOnboardSales,
} from '../services/personalBus.service';
import type {
  OnboardSaleOptions,
  OnboardSalesSummary,
  PassengerCategory,
} from '../types/personalBus.types';
import { CATEGORY_LABELS, formatMoney } from '../utils/format';

interface OnboardSalePanelProps {
  tripId: number;
}

const EMPTY_FORM = {
  idNumber: '',
  firstName: '',
  lastName: '',
  category: 'regular' as PassengerCategory,
  boardingDescription: '',
  destinationDescription: '',
  price: '',
};

function discounted(price: string, category: PassengerCategory): string {
  const base = Number(price);
  return (category === 'regular' ? base : base / 2).toFixed(2);
}

export function OnboardSalePanel({ tripId }: OnboardSalePanelProps) {
  const [segment, setSegment] = useState<{ origin?: number; destination?: number }>({});
  const [options, setOptions] = useState<OnboardSaleOptions | null>(null);
  const [summary, setSummary] = useState<OnboardSalesSummary | null>(null);
  const [seatId, setSeatId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      getOnboardSaleOptions(tripId, segment.origin, segment.destination),
      listOnboardSales(tripId),
    ])
      .then(([nextOptions, nextSummary]) => {
        if (!active) return;
        setOptions(nextOptions);
        setSummary(nextSummary);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'No fue posible cargar los asientos.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [tripId, segment, reloadKey]);

  const selectedSeat = options?.seats.find((seat) => seat.seatId === seatId) ?? null;
  const suggested = selectedSeat?.suggestedPrice ?? null;

  const changeSegment = (key: 'origin' | 'destination', value: number) => {
    setSeatId(null);
    setSegment((current) => ({
      origin: current.origin ?? options?.originCityId,
      destination: current.destination ?? options?.destinationCityId,
      [key]: value,
    }));
  };

  const update = (field: keyof typeof EMPTY_FORM, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!options || !selectedSeat) {
      setError('Elige un asiento libre.');
      return;
    }
    const fieldError =
      cedulaError(form.idNumber) ??
      nameError(form.firstName) ??
      nameError(form.lastName) ??
      (!form.boardingDescription.trim() || !form.destinationDescription.trim()
        ? 'Escribe dónde subió y a dónde va el pasajero.'
        : null) ??
      (!suggested && !form.price ? 'Este tramo no tiene tarifa; escribe el precio.' : null);
    if (fieldError) {
      setError(fieldError);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const sale = await createOnboardSale(tripId, {
        seatId: selectedSeat.seatId,
        passenger: {
          idNumber: form.idNumber,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          category: form.category,
        },
        originCityId: options.originCityId,
        destinationCityId: options.destinationCityId,
        boardingDescription: form.boardingDescription.trim(),
        destinationDescription: form.destinationDescription.trim(),
        price: form.price ? Number(form.price).toFixed(2) : undefined,
      });
      setNotice(
        `Venta registrada: asiento ${sale.seatNumber}, ${formatMoney(sale.price)} en efectivo.`,
      );
      setForm(EMPTY_FORM);
      setSeatId(null);
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'No fue posible registrar la venta.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!options) {
    return error ? (
      <p className="oficinista-operations__alert" role="alert">
        {error}
      </p>
    ) : (
      <p role="status">Cargando asientos libres...</p>
    );
  }

  return (
    <>
      <form className="oficinista-operations__form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Parada registrada donde subió
          <select
            value={options.originCityId}
            onChange={(event) => changeSegment('origin', Number(event.target.value))}
          >
            {options.stops.slice(0, -1).map((stop) => (
              <option key={stop.cityId} value={stop.cityId}>
                {stop.cityName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Parada registrada de destino
          <select
            value={options.destinationCityId}
            onChange={(event) => changeSegment('destination', Number(event.target.value))}
          >
            {options.stops.slice(1).map((stop) => (
              <option key={stop.cityId} value={stop.cityId}>
                {stop.cityName}
              </option>
            ))}
          </select>
        </label>

        <div className="personal-bus__seat-field">
          <p>Asiento libre</p>
          <div className="oficinista-operations__seat-grid personal-bus__seat-grid">
            {options.seats.map((seat) => (
              <button
                key={seat.seatId}
                type="button"
                className={`oficinista-operations__seat${
                  seat.seatId === seatId ? ' oficinista-operations__seat--selected' : ''
                }`}
                disabled={!seat.isFree}
                aria-pressed={seat.seatId === seatId}
                onClick={() => setSeatId(seat.seatId)}
              >
                {seat.seatNumber}
                {seat.suggestedPrice && <small>{formatMoney(seat.suggestedPrice)}</small>}
              </button>
            ))}
          </div>
        </div>

        <label>
          Cédula
          <input
            inputMode="numeric"
            value={form.idNumber}
            onChange={(event) => update('idNumber', onlyDigits(event.target.value, 10))}
          />
        </label>
        <label>
          Nombres
          <input
            value={form.firstName}
            onChange={(event) => update('firstName', cleanName(event.target.value))}
          />
        </label>
        <label>
          Apellidos
          <input
            value={form.lastName}
            onChange={(event) => update('lastName', cleanName(event.target.value))}
          />
        </label>
        <label>
          Tipo de pasajero
          <select
            value={form.category}
            onChange={(event) => update('category', event.target.value)}
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lugar donde subió
          <input
            value={form.boardingDescription}
            maxLength={255}
            placeholder="Por ejemplo: gasolinera de Salcedo"
            onChange={(event) => update('boardingDescription', event.target.value)}
          />
        </label>
        <label>
          A dónde va
          <input
            value={form.destinationDescription}
            maxLength={255}
            placeholder="Por ejemplo: terminal de Loja"
            onChange={(event) => update('destinationDescription', event.target.value)}
          />
        </label>
        <label>
          Precio en efectivo
          <input
            inputMode="decimal"
            value={form.price}
            placeholder={
              suggested ? `Sugerido: ${discounted(suggested, form.category)}` : 'Escribe el precio'
            }
            onChange={(event) => update('price', event.target.value.replace(/[^\d.]/g, ''))}
          />
        </label>
        {suggested && !form.price && (
          <p>
            Se cobrará {formatMoney(discounted(suggested, form.category))}. Escribe otro valor si
            acordaste un precio distinto.
          </p>
        )}

        {error && (
          <p className="oficinista-operations__alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="oficinista-operations__notice" role="status">
            {notice}
          </p>
        )}
        <button type="submit" disabled={saving}>
          Registrar venta en efectivo
        </button>
      </form>

      {summary && (
        <div className="personal-bus__sales">
          <div className="oficinista-operations__card-heading">
            <h3>Ventas a bordo de este viaje</h3>
            <strong>{formatMoney(summary.total)}</strong>
          </div>
          {summary.sales.length === 0 ? (
            <p className="oficinista-operations__empty">Todavía no hay ventas a bordo.</p>
          ) : (
            <ul className="personal-bus__passengers">
              {summary.sales.map((sale) => (
                <li key={sale.ticketId}>
                  <strong>Asiento {sale.seatNumber}</strong>
                  <span>
                    {sale.passengerName} · {sale.originCityName} - {sale.destinationCityName}
                  </span>
                  <span>{formatMoney(sale.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
