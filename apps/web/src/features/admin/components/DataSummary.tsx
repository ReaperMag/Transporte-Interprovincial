import { mockAdminSummary } from '../data/admin.mock';
import './DataSummary.css';

export function DataSummary() {
  return (
    <section className="data-summary" aria-labelledby="data-summary-title">
      <h2 className="data-summary__title" id="data-summary-title">
        Resumen de Datos
      </h2>

      <dl className="data-summary__grid">
        {mockAdminSummary.map((metric) => (
          <div className="data-summary__item" key={metric.id}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
