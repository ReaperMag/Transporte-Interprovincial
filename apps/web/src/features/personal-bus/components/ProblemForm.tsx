import { useState, type FormEvent } from 'react';
import { reportProblem } from '../services/personalBus.service';
import type { ProblemType, TripProblem } from '../types/personalBus.types';

interface ProblemFormProps {
  tripId: number;
  onReported: (problem: TripProblem) => void;
  onCancel: () => void;
}

const PROBLEM_OPTIONS: { value: ProblemType | ''; label: string }[] = [
  { value: '', label: 'Sin tipo' },
  { value: 'delay', label: 'Retraso' },
  { value: 'mechanical', label: 'Falla mecánica' },
  { value: 'other', label: 'Otro' },
];

export function ProblemForm({ tripId, onReported, onCancel }: ProblemFormProps) {
  const [comment, setComment] = useState('');
  const [problemType, setProblemType] = useState<ProblemType | ''>('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (comment.trim().length < 3) {
      setError('Describe el problema en el comentario.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const problem = await reportProblem(tripId, comment.trim(), problemType || null);
      setComment('');
      setProblemType('');
      onReported(problem);
    } catch (reportError) {
      setError(
        reportError instanceof Error ? reportError.message : 'No fue posible reportar el problema.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="oficinista-operations__form" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Tipo de problema
        <select
          value={problemType}
          onChange={(event) => setProblemType(event.target.value as ProblemType | '')}
        >
          {PROBLEM_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Comentario
        <textarea
          className="personal-bus__textarea"
          value={comment}
          maxLength={500}
          rows={3}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Cuéntale a la oficina qué está pasando"
        />
      </label>
      {error && (
        <p className="oficinista-operations__alert" role="alert">
          {error}
        </p>
      )}
      <div className="oficinista-operations__actions">
        <button type="submit" className="oficinista-operations__button" disabled={sending}>
          Enviar a la oficina
        </button>
        <button
          type="button"
          className="oficinista-operations__button--secondary"
          onClick={onCancel}
          disabled={sending}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
