import { useState } from 'react';
import './PassengerCountModal.css';

interface PassengerCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (count: number) => void;
}

export function PassengerCountModal({ isOpen, onClose, onConfirm }: PassengerCountModalProps) {
  const [count, setCount] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  const handleChange = (value: string) => {
    const num = Number(value);
    if (Number.isNaN(num)) {
      setCount(1);
      setError(null);
      return;
    }
    setCount(num);
    if (num < 1 || num > 10) {
      setError('Solo se permiten entre 1 y 10 personas.');
    } else {
      setError(null);
    }
  };

  const handleConfirm = () => {
    if (count < 1 || count > 10) {
      setError('Solo se permiten entre 1 y 10 personas.');
      return;
    }
    onConfirm(count);
  };

  return (
    <div className="passenger-count-modal__backdrop">
      <div className="passenger-count-modal">
        <header className="passenger-count-modal__header">
          <h2 className="passenger-count-modal__title">Cantidad de pasajeros</h2>
        </header>
        <div className="passenger-count-modal__body">
          <label className="passenger-count-modal__label" htmlFor="passenger-count">
            ¿Cuántas personas irán?
          </label>
          <input
            id="passenger-count"
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => handleChange(e.target.value)}
            className="passenger-count-modal__input"
          />
          {error && <p className="passenger-count-modal__error">{error}</p>}
        </div>
        <footer className="passenger-count-modal__footer">
          <button type="button" className="passenger-count-modal__button passenger-count-modal__button--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="passenger-count-modal__button passenger-count-modal__button--primary" onClick={handleConfirm}>
            Continuar
          </button>
        </footer>
      </div>
    </div>
  );
}
