import type { AdminSectionContent } from '../types/admin.types';
import './AdminSectionPage.css';

export function AdminSectionPage({ title, description }: AdminSectionContent) {
  return (
    <div className="admin-section">
      <nav className="admin-breadcrumb" aria-label="Miga de pan">
        <span>Inicio</span>
        <span aria-hidden="true"> / </span>
        <span>{title}</span>
      </nav>

      <section className="admin-section__card" aria-labelledby="admin-section-title">
        <h2 className="admin-section__title" id="admin-section-title">
          {title}
        </h2>
        <p className="admin-section__description">{description}</p>
      </section>
    </div>
  );
}
