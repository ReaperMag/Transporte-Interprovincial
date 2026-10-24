import { BrowserRouter, Routes } from 'react-router-dom';
import { adminRoutes } from './adminRoutes';
import { publicRoutes } from './publicRoutes';
import { oficinistaRoutes } from './oficinistaRoutes';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {publicRoutes}
        {adminRoutes}
        {oficinistaRoutes}
      </Routes>
    </BrowserRouter>
  );
}
