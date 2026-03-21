import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BACKEND_PORT = process.env.BACKEND_PORT || '8080';

export default defineConfig({
  plugins: [react()],
  // Use relative base so assets work when served from Django
  base: '/',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/media': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../backend/staticfiles/frontend',
    emptyOutDir: true,
    // Ensure assets are referenced with absolute paths
    assetsDir: 'assets',
  },
});
