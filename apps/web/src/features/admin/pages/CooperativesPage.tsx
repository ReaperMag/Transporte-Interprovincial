import { CooperativesTable } from '../components/CooperativesTable';
import { DataSummary } from '../components/DataSummary';
import './CooperativesPage.css';

export function CooperativesPage() {
  return (
    <div className="cooperatives-page">
      <nav className="admin-breadcrumb" aria-label="Miga de pan">
        <span>Inicio</span>
        <span aria-hidden="true"> / </span>
        <span>Gestión de Cooperativas</span>
      </nav>

      <CooperativesTable />
      <DataSummary />
    </div>
  );
}
