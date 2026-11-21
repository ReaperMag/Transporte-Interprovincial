import { useEffect, useState } from 'react';

// Cada cuánto se recuerda al personal que debe iniciar el viaje o reportar un problema.
export const BOARDING_ALERT_MS = 3 * 60 * 1000;
const CHECK_EVERY_MS = 5000;

interface BoardingAlertProps {
  boardingStartedAt: string;
  busy: boolean;
  onStartTrip: () => void;
  onReportProblem: () => void;
}

export function BoardingAlert({
  boardingStartedAt,
  busy,
  onStartTrip,
  onReportProblem,
}: BoardingAlertProps) {
  const [nextAlertAt, setNextAlertAt] = useState(
    () => new Date(boardingStartedAt).getTime() + BOARDING_ALERT_MS,
  );
  // Minutos de abordaje al mostrar el aviso; nulo mientras está oculto.
  const [shownMinutes, setShownMinutes] = useState<number | null>(null);

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      if (now >= nextAlertAt) {
        const minutes = Math.floor((now - new Date(boardingStartedAt).getTime()) / 60000);
        setShownMinutes((current) => {
          if (current === null) navigator.vibrate?.([200, 100, 200]);
          return minutes;
        });
      }
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    const first = window.setTimeout(check, 0);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [nextAlertAt, boardingStartedAt]);

  if (shownMinutes === null) return null;

  // Si el personal cierra el aviso sin elegir, vuelve a salir en 3 minutos.
  const postpone = () => {
    setShownMinutes(null);
    setNextAlertAt(Date.now() + BOARDING_ALERT_MS);
  };

  return (
    <div className="personal-bus__alert" role="alertdialog" aria-labelledby="boarding-alert-title">
      <div className="personal-bus__alert-box">
        <h2 id="boarding-alert-title">Llevas {shownMinutes} minutos de abordaje</h2>
        <p>¿Ya puedes salir o hay algún problema?</p>
        <div className="oficinista-operations__actions">
          <button
            type="button"
            className="oficinista-operations__button"
            disabled={busy}
            onClick={() => {
              setShownMinutes(null);
              onStartTrip();
            }}
          >
            Iniciar viaje
          </button>
          <button
            type="button"
            className="oficinista-operations__button--danger"
            onClick={() => {
              postpone();
              onReportProblem();
            }}
          >
            Reportar un problema
          </button>
          <button
            type="button"
            className="oficinista-operations__button--secondary"
            onClick={postpone}
          >
            Seguir abordando
          </button>
        </div>
      </div>
    </div>
  );
}
