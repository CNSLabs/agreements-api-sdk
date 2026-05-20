import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devServerPort = Number(process.env.API_PLAYGROUND_PORT || 5176);
const nginxPort = Number(process.env.NGINX_PORT || 8080);

export default defineConfig({
  base: '/api-playground/',
  plugins: [react()],
  server: {
    host: true,
    port: devServerPort,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1'],
    proxy: {
      '/agreements': {
        target: `http://127.0.0.1:${nginxPort}`,
        changeOrigin: true,
      },
      '^/api(?:/|$)': {
        target: `http://127.0.0.1:${nginxPort}`,
        changeOrigin: true,
      },
      '/v0': {
        target: `http://127.0.0.1:${nginxPort}`,
        changeOrigin: true,
      },
      '/auth-api': {
        target: `http://127.0.0.1:${nginxPort}`,
        changeOrigin: true,
      },
      '/agreements-api': {
        target: `http://127.0.0.1:${nginxPort}`,
        changeOrigin: true,
      },
      '/notifications-api': {
        target: `http://127.0.0.1:${nginxPort}`,
        changeOrigin: true,
      },
    },
  },
});
