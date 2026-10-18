import { useState } from 'react';
import { mockCooperatives } from '../data/admin.mock';
import type { Cooperative } from '../types/admin.types';
import './CooperativesTable.css';

function CooperativeLogo({ cooperative }: { cooperative: Cooperative }) {
  return (
    <span
      className="cooperatives-table__logo"
      style={{
        background: `linear-gradient(145deg, ${cooperative.logo.from}, ${cooperative.logo.to})`,
      }}
      aria-hidden="true"
    >
      {cooperative.logo.initials}
    </span>
  );
}

export function CooperativesTable() {
  const [cooperatives, setCooperatives] = useState(mockCooperatives);

  const toggleStatus = (id: string) => {
    setCooperatives((current) =>
      current.map((cooperative) =>
        cooperative.id === id
          ? { ...cooperative, isActive: !cooperative.isActive }
          : cooperative,
      ),
    );
  };

  return (
    <section className="cooperatives-card" aria-labelledby="cooperatives-title">
      <header className="cooperatives-card__header">
        <div>
          <h2 className="cooperatives-card__title" id="cooperatives-title">
            Cooperativas
          </h2>
          <p className="cooperatives-card__subtitle">Gestión de Cooperativas</p>
        </div>

        <button className="cooperatives-card__create" type="button">
          Nueva Cooperativa
        </button>
      </header>

      <div className="cooperatives-table-wrap">
        <table className="cooperatives-table">
          <thead>
            <tr>
              <th>Logo</th>
              <th>Nombre de Cooperativa</th>
              <th>Correo de Contacto</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cooperatives.map((cooperative) => (
              <tr key={cooperative.id}>
                <td>
                  <CooperativeLogo cooperative={cooperative} />
                </td>
                <td>{cooperative.name}</td>
                <td>{cooperative.email}</td>
                <td>{cooperative.phone}</td>
                <td>
                  <div className="cooperatives-table__status">
                    <span>{cooperative.isActive ? 'Activo' : 'Inactivo'}</span>
                    <button
                      className={
                        cooperative.isActive
                          ? 'cooperatives-table__switch cooperatives-table__switch--on'
                          : 'cooperatives-table__switch'
                      }
                      type="button"
                      role="switch"
                      aria-checked={cooperative.isActive}
                      aria-label={`Cambiar estado de ${cooperative.name}`}
                      onClick={() => toggleStatus(cooperative.id)}
                    />
                  </div>
                </td>
                <td>
                  <div className="cooperatives-table__actions">
                    <button type="button" aria-label={`Editar ${cooperative.name}`}>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M4 20h4.2L19 9.2a1.5 1.5 0 0 0 0-2.1L16.9 5a1.5 1.5 0 0 0-2.1 0L4 15.8V20Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      className="cooperatives-table__action--danger"
                      type="button"
                      aria-label={`Eliminar ${cooperative.name}`}
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M5 7h14M10 7V5h4v2M8 7l.8 12h6.4L16 7"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <button type="button" aria-label={`Ver ${cooperative.name}`}>
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path
                          d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        />
                        <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.7" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
