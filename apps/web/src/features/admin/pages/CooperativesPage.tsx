import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, getAdminSummary } from '../services/cooperatives.service';
import type { AdminSummary } from '../types/admin.types';
import { CooperativesTable } from '../components/CooperativesTable';
import { DataSummary } from '../components/DataSummary';
import './CooperativesPage.css';

export function CooperativesPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const refreshSummary = useCallback(async (signal?: AbortSignal) => {
    try {
      setSummary(await getAdminSummary(signal));
      setSummaryError(null);
    } catch (error) {
      if (!signal?.aborted) {
        setSummaryError(
          error instanceof AdminApiError
            ? error.message
            : 'No se pudo cargar el resumen del administrador.',
        );
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getAdminSummary(controller.signal)
      .then((data) => {
        setSummary(data);
        setSummaryError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSummaryError(
            error instanceof AdminApiError
              ? error.message
              : 'No se pudo cargar el resumen del administrador.',
          );
        }
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="cooperatives-page">
      <nav className="admin-breadcrumb" aria-label="Miga de pan">
        <span>Administración del sistema</span>
        <span aria-hidden="true"> / </span>
        <span>Gestión de Cooperativas</span>
      </nav>

      <header className="cooperatives-page__intro">
        <div>
          <p className="cooperatives-page__kicker">Administración del sistema</p>
          <h1>Gestión de Cooperativas</h1>
          <p>Registra cooperativas y controla su acceso a la plataforma.</p>
        </div>
      </header>

      <CooperativesTable onDataChanged={() => void refreshSummary()} />
      <DataSummary summary={summary} error={summaryError} />
    </div>
  );
}
