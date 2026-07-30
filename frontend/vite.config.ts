import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',   // explicit IPv4 — avoids ECONNREFUSED AggregateError
        changeOrigin: true,                 // when localhost resolves to ::1 but backend binds 0.0.0.0
      },
    },
  },
});
