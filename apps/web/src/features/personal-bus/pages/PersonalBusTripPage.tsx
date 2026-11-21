import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BoardingAlert } from '../components/BoardingAlert';
import { ProblemForm } from '../components/ProblemForm';
import { QrScanner } from '../components/QrScanner';
import {
  confirmCategory,
  finishTrip,
  getMyTrip,
  rejectCategory,
  startBoarding,
  startTrip,
  validateTicket,
} from '../services/personalBus.service';
import type { TripDetail, TripPassenger, TripProblem } from '../types/personalBus.types';
import {
  CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TRIP_STATUS_LABELS,
  formatDateTime,
} from '../utils/format';
import '../../oficinista/pages/OficinistaOperationsPage.css';
import './PersonalBusPages.css';

type ScanResult =
  | { kind: 'boarded'; passenger: TripPassenger }
  | { kind: 'check'; passenger: TripPassenger }
  | { kind: 'rejected'; passenger: TripPassenger }
  | { kind: 'error'; message: string };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function PersonalBusTripPage() {
  const tripId = Number(useParams().tripId);
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyTrip(tripId)
      .then((result) => {
        if (active) setTrip(result);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorMessage(loadError, 'No fue posible cargar el viaje.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tripId]);

  const refresh = useCallback(async () => {
    setTrip(await getMyTrip(tripId));
  }, [tripId]);

  const runAction = async (action: () => Promise<TripDetail>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setTrip(await action());
      setScanResult(null);
    } catch (actionError) {
      setError(errorMessage(actionError, 'No fue posible completar la acción.'));
    } finally {
      setBusy(false);
      setConfirmingFinish(false);
    }
  };

  const handleCode = useCallback(
    async (code: string) => {
      setBusy(true);
      try {
        const result = await validateTicket(tripId, code);
        setScanResult({
          kind: result.result === 'boarded' ? 'boarded' : 'check',
          passenger: result.passenger,
        });
        await refresh();
      } catch (scanError) {
        setScanResult({ kind: 'error', message: errorMessage(scanError, 'Boleto no válido.') });
      } finally {
        setBusy(false);
      }
    },
    [tripId, refresh],
  );

  const handleManualCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setManualCode('');
    void handleCode(code);
  };

  const handleCategory = async (passenger: TripPassenger, accepted: boolean) => {
    setBusy(true);
    try {
      const updated = accepted
        ? await confirmCategory(tripId, passenger.ticketId)
        : await rejectCategory(tripId, passenger.ticketId);
      setScanResult({ kind: accepted ? 'boarded' : 'rejected', passenger: updated });
      await refresh();
    } catch (categoryError) {
      setScanResult({
        kind: 'error',
        message: errorMessage(categoryError, 'No fue posible registrar la verificación.'),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleProblemReported = (problem: TripProblem) => {
    setShowProblemForm(false);
    setNotice('Problema enviado. La oficina recibió el aviso.');
    setTrip((current) =>
      current ? { ...current, problems: [...current.problems, problem] } : current,
    );
  };

  if (loading) return <p role="status">Cargando viaje...</p>;
  if (!trip) {
    return (
      <section className="oficinista-operations personal-bus">
        <p className="oficinista-operations__alert" role="alert">
          {error ?? 'Viaje no encontrado.'}
        </p>
        <Link to="/personal-bus/viajes">Volver a mis viajes</Link>
      </section>
    );
  }

  const boarded = trip.passengers.filter((passenger) => passenger.status === 'used').length;

  return (
    <section className="oficinista-operations personal-bus">
      <header className="oficinista-operations__header">
        <p className="oficinista-operations__eyebrow">
          <Link to="/personal-bus/viajes">Mis viajes</Link> / Viaje #{trip.id}
        </p>
        <h1>
          {trip.originCityName} - {trip.destinationCityName}
        </h1>
        <p>
          Salida {formatDateTime(trip.departureAt)} · Bus {trip.busNumber} ·{' '}
          <span className={`personal-bus__status personal-bus__status--${trip.status}`}>
            {TRIP_STATUS_LABELS[trip.status]}
          </span>
        </p>
      </header>

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

      {trip.status === 'scheduled' && (
        <section className="oficinista-operations__card">
          <h2>Abordaje</h2>
          <p>
            El abordaje se puede iniciar desde 30 minutos antes de la salida. Al iniciarlo se cierra
            la venta en línea y en oficina.
          </p>
          <div className="oficinista-operations__actions">
            <button
              type="button"
              className="oficinista-operations__button"
              disabled={busy}
              onClick={() => void runAction(() => startBoarding(trip.id))}
            >
              Iniciar abordaje
            </button>
          </div>
        </section>
      )}

      {trip.status === 'boarding' && (
        <section className="oficinista-operations__card">
          <div className="oficinista-operations__card-heading">
            <div>
              <h2>Validar boletos</h2>
              <p>
                {boarded} de {trip.passengers.length} pasajeros abordaron
              </p>
            </div>
          </div>

          {scanResult && (
            <ScanResultBox result={scanResult} busy={busy} onCategory={handleCategory} />
          )}

          <QrScanner onCode={(code) => void handleCode(code)} enabled={!busy} />

          <form className="personal-bus__manual" onSubmit={handleManualCode}>
            <label htmlFor="manual-code">Código del boleto</label>
            <div>
              <input
                id="manual-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Escribe el código si la cámara no lo lee"
                autoComplete="off"
              />
              <button type="submit" className="oficinista-operations__button" disabled={busy}>
                Validar
              </button>
            </div>
          </form>

          <div className="oficinista-operations__actions">
            <button
              type="button"
              className="oficinista-operations__button"
              disabled={busy}
              onClick={() => void runAction(() => startTrip(trip.id))}
            >
              Iniciar viaje
            </button>
          </div>
        </section>
      )}

      {trip.status === 'boarding' && trip.boardingStartedAt && (
        <BoardingAlert
          boardingStartedAt={trip.boardingStartedAt}
          busy={busy}
          onStartTrip={() => void runAction(() => startTrip(trip.id))}
          onReportProblem={() => {
            setShowProblemForm(true);
            window.setTimeout(
              () =>
                document
                  .getElementById('trip-problems')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              0,
            );
          }}
        />
      )}

      {trip.status === 'in_progress' && (
        <section className="oficinista-operations__card">
          <h2>Viaje en curso</h2>
          <p>Salida real: {formatDateTime(trip.startedAt)}</p>
          <div className="oficinista-operations__actions">
            {confirmingFinish ? (
              <>
                <span>¿Ya llegaron al destino?</span>
                <button
                  type="button"
                  className="oficinista-operations__button"
                  disabled={busy}
                  onClick={() => void runAction(() => finishTrip(trip.id))}
                >
                  Sí, finalizar
                </button>
                <button
                  type="button"
                  className="oficinista-operations__button--secondary"
                  onClick={() => setConfirmingFinish(false)}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="oficinista-operations__button"
                onClick={() => setConfirmingFinish(true)}
              >
                Finalizar viaje
              </button>
            )}
          </div>
        </section>
      )}

      {trip.status === 'finished' && (
        <section className="oficinista-operations__card">
          <h2>Viaje finalizado</h2>
          <p>Llegada: {formatDateTime(trip.finishedAt)}</p>
        </section>
      )}

      {trip.status !== 'finished' && trip.status !== 'cancelled' && (
        <section className="oficinista-operations__card" id="trip-problems">
          <div className="oficinista-operations__card-heading">
            <div>
              <h2>Problemas del viaje</h2>
              <p>La oficina recibe un aviso con cada problema que reportes.</p>
            </div>
            {!showProblemForm && (
              <button
                type="button"
                className="oficinista-operations__button--secondary"
                onClick={() => setShowProblemForm(true)}
              >
                Reportar un problema
              </button>
            )}
          </div>
          {showProblemForm && (
            <ProblemForm
              tripId={trip.id}
              onReported={handleProblemReported}
              onCancel={() => setShowProblemForm(false)}
            />
          )}
          {trip.problems.length > 0 && (
            <ul className="personal-bus__problems">
              {trip.problems.map((problem) => (
                <li key={problem.id}>
                  {problem.comment}
                  <small>
                    {formatDateTime(problem.reportedAt)} ·{' '}
                    {problem.resolvedAt ? 'Atendido por la oficina' : 'Pendiente en la oficina'}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="oficinista-operations__card">
        <h2>Pasajeros</h2>
        {trip.passengers.length === 0 ? (
          <p className="oficinista-operations__empty">Este viaje no tiene boletos vendidos.</p>
        ) : (
          <ul className="personal-bus__passengers">
            {trip.passengers.map((passenger) => (
              <li key={passenger.ticketId}>
                <strong>Asiento {passenger.seatNumber}</strong>
                <span>
                  {passenger.passengerName} · {CATEGORY_LABELS[passenger.passengerCategory]}
                </span>
                <span className={`personal-bus__status personal-bus__status--${passenger.status}`}>
                  {TICKET_STATUS_LABELS[passenger.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

interface ScanResultBoxProps {
  result: ScanResult;
  busy: boolean;
  onCategory: (passenger: TripPassenger, accepted: boolean) => Promise<void>;
}

function ScanResultBox({ result, busy, onCategory }: ScanResultBoxProps) {
  if (result.kind === 'error') {
    return (
      <div className="personal-bus__result personal-bus__result--error" role="alert">
        <strong>No puede subir</strong>
        <p>{result.message}</p>
      </div>
    );
  }

  const { passenger } = result;
  const summary = `Asiento ${passenger.seatNumber} · ${passenger.passengerName} · ${passenger.originCityName} - ${passenger.destinationCityName}`;

  if (result.kind === 'check') {
    return (
      <div className="personal-bus__result personal-bus__result--check" role="status">
        <strong>Verifica la cédula o el carné</strong>
        <p>{summary}</p>
        <p>Categoría: {CATEGORY_LABELS[passenger.passengerCategory]}</p>
        <div className="oficinista-operations__actions">
          <button
            type="button"
            className="oficinista-operations__button"
            disabled={busy}
            onClick={() => void onCategory(passenger, true)}
          >
            Confirmar
          </button>
          <button
            type="button"
            className="oficinista-operations__button--danger"
            disabled={busy}
            onClick={() => void onCategory(passenger, false)}
          >
            No corresponde
          </button>
        </div>
      </div>
    );
  }

  if (result.kind === 'rejected') {
    return (
      <div className="personal-bus__result personal-bus__result--error" role="status">
        <strong>Boleto rechazado</strong>
        <p>{summary}</p>
        <p>La persona no sube. Puede cambiar su boleto en la oficina por uno de su categoría.</p>
      </div>
    );
  }

  return (
    <div className="personal-bus__result personal-bus__result--ok" role="status">
      <strong>Boleto válido</strong>
      <p>{summary}</p>
    </div>
  );
}
