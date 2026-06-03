import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

const devServerPort = Number(process.env.AGREEMENTS_FRONTEND_PORT || 5184);

const plugins = [
  react(),
  tailwindcss(),
  svgr(),
];

const sentrySourcemapsEnabled =
  process.env.VITE_SENTRY_ENABLED === 'true' &&
  Boolean(process.env.VITE_SENTRY_DSN) &&
  Boolean(process.env.SENTRY_AUTH_TOKEN) &&
  Boolean(process.env.SENTRY_ORG) &&
  Boolean(process.env.SENTRY_PROJECT) &&
  Boolean(process.env.VITE_SENTRY_RELEASE);

if (sentrySourcemapsEnabled) {
  plugins.push(
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      sourcemaps: {
        filesToDeleteAfterUpload: ['dist/**/*.map'],
      },
      release: {
        name: process.env.VITE_SENTRY_RELEASE,
      },
      telemetry: false,
    }),
  );
}

export default defineConfig({
  // Ensure import.meta.env.BASE_URL is '/agreements/' for routing + link generation.
  base: '/agreements/',
  build: {
    sourcemap: sentrySourcemapsEnabled ? 'hidden' : false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        sourcemapExcludeSources: false,
      },
    },
  },
  plugins,
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: devServerPort,
    strictPort: true,
    host: true,
    allowedHosts: [
      'localhost',
    ],
  },
})
