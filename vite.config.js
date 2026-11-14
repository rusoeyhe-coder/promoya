import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En la PC: Vite (3900) muestra el panel y pasa la API a wrangler (8788).
const api = { target: 'http://127.0.0.1:8788', changeOrigin: false };
export default defineConfig({
  plugins: [react()],
  server: { port: 3900, strictPort: true, proxy: { '/api': api, '/l/': api, '/o/': api, '/baja/': api } },
});
