import type { AdminSummary } from '../types/admin.types';
import './DataSummary.css';

interface DataSummaryProps {
  summary: AdminSummary | null;
  error: string | null;
}

export function DataSummary({ summary, error }: DataSummaryProps) {
  const metrics = summary
    ? [
        { id: 'cooperatives', label: 'Cooperativas Registradas:', value: summary.cooperatives },
        { id: 'routes', label: 'Rutas Totales:', value: summary.routes },
        { id: 'buses', label: 'Buses en Servicio:', value: summary.buses },
      ]
    : [];

  return (
    <section className="data-summary" aria-labelledby="data-summary-title">
      <h2 className="data-summary__title" id="data-summary-title">
        Resumen de Datos
      </h2>

      {error ? (
        <p className="data-summary__message" role="alert">{error}</p>
      ) : !summary ? (
        <p className="data-summary__message">Cargando resumen...</p>
      ) : (
        <dl className="data-summary__grid">
        {metrics.map((metric) => (
          <div className="data-summary__item" key={metric.id}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
        </dl>
      )}
    </section>
  );
}
