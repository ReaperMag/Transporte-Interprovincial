import { BrowserRouter, Routes } from 'react-router-dom';
import { adminRoutes } from './adminRoutes';
import { passengerRoutes } from './passengerRoutes';
import { publicRoutes } from './publicRoutes';
import { oficinistaRoutes } from './oficinistaRoutes';
import { cooperativeRoutes } from './cooperativeRoutes';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {publicRoutes}
        {adminRoutes}
        {passengerRoutes}
        {oficinistaRoutes}
        {cooperativeRoutes}
      </Routes>
    </BrowserRouter>
  );
}
