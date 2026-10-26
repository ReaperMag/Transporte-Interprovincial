import { BrowserRouter, Routes } from 'react-router-dom';
import { adminRoutes } from './adminRoutes';
import { passengerRoutes } from './passengerRoutes';
import { publicRoutes } from './publicRoutes';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {publicRoutes}
        {adminRoutes}
        {passengerRoutes}
      </Routes>
    </BrowserRouter>
  );
}
