import { Navigate, Route } from 'react-router-dom';
import { AdminLayout } from '../../features/admin/components/AdminLayout';
import { AdminSectionPage } from '../../features/admin/pages/AdminSectionPage';
import { CooperativesPage } from '../../features/admin/pages/CooperativesPage';

export const adminRoutes = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<Navigate to="cooperativas" replace />} />
    <Route path="cooperativas" element={<CooperativesPage />} />
    <Route
      path="oficinistas"
      element={
        <AdminSectionPage
          title="Oficinistas"
          description="Vista preliminar. Aquí se gestionará el personal de oficina de cada cooperativa."
        />
      }
    />
    <Route
      path="usuarios-bus"
      element={
        <AdminSectionPage
          title="Usuarios Bus"
          description="Vista preliminar. Aquí se consultará el personal asignado a los buses."
        />
      }
    />
    <Route
      path="ventas"
      element={
        <AdminSectionPage
          title="Ventas"
          description="Vista preliminar. Aquí se resumirán las ventas de pasajes registradas en la plataforma."
        />
      }
    />
    <Route
      path="reportes"
      element={
        <AdminSectionPage
          title="Reportes"
          description="Vista preliminar. Aquí se mostrarán reportes operativos y de ocupación."
        />
      }
    />
  </Route>
);
