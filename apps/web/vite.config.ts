import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Origen que espera la API en desarrollo (FRONTEND_ORIGIN del backend).
const API_FRONTEND_ORIGIN = 'http://localhost:5173';

export default defineConfig(({ mode }) => {
  // `npm run dev:movil` abre el servidor con HTTPS en la red local, para que
  // el navegador del celular permita usar la cámara al leer los boletos.
  const isMobile = mode === 'movil';

  return {
    plugins: isMobile ? [react(), basicSsl()] : [react()],
    server: {
      port: 5173,
      host: isMobile ? true : undefined,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          // Desde el celular el origen es https://<ip-de-la-pc>:5173 y la API
          // solo acepta el origen configurado, así que el proxy de desarrollo
          // lo reemplaza. No aplica a producción.
          headers: isMobile ? { origin: API_FRONTEND_ORIGIN } : undefined,
        },
      },
    },
  };
});
