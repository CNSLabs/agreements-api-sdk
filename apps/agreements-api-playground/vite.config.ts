import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/api-playground/' : '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5176,
    allowedHosts: ['localhost', '127.0.0.1'],
    proxy: {
      '/agreements': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/auth-api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/agreements-api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/notifications-api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
}));
