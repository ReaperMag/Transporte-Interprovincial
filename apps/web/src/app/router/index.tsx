import { BrowserRouter, Routes } from 'react-router-dom';
import { publicRoutes } from './publicRoutes';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>{publicRoutes}</Routes>
    </BrowserRouter>
  );
}
