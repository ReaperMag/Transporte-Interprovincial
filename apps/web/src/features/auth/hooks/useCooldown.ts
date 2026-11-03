import { useEffect, useState } from 'react';

/** Debe coincidir con la espera mínima entre códigos que aplica la API. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Cuenta regresiva para volver a solicitar un código.
 * La API no informa la espera, así que se controla solo en el navegador.
 */
export function useCooldown(initialSeconds = 0) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft]);

  return {
    secondsLeft,
    isCoolingDown: secondsLeft > 0,
    start: () => setSecondsLeft(RESEND_COOLDOWN_SECONDS),
  };
}
