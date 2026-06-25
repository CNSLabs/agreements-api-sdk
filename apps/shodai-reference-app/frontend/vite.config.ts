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

function manualChunkFor(id: string): string | undefined {
  if (!id.includes('/node_modules/')) return undefined;
  const packageName = nodePackageName(id);
  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router/') || id.includes('/@tanstack/react-query/')) {
    return 'vendor-react';
  }
  if (packageName === 'viem' || packageName === 'ox' || packageName === 'wagmi') {
    return 'vendor-chain';
  }
  if (
    id.includes('/@dynamic-labs/') ||
    id.includes('/@walletconnect/') ||
    id.includes('/@reown/') ||
    id.includes('/@turnkey/') ||
    id.includes('/wagmi/') ||
    id.includes('/viem/') ||
    id.includes('/ox/')
  ) {
    return `vendor-${safeChunkName(packageName || 'wallet')}`;
  }
  if (
    id.includes('/@subframe/') ||
    id.includes('/@radix-ui/') ||
    id.includes('/class-variance-authority/') ||
    id.includes('/lucide-react/')
  ) {
    return 'vendor-ui';
  }
  if (
    id.includes('/react-markdown/') ||
    id.includes('/remark-') ||
    id.includes('/rehype-') ||
    id.includes('/unified/') ||
    id.includes('/mdast') ||
    id.includes('/hast')
  ) {
    return 'vendor-markdown';
  }
  if (id.includes('/@sentry/')) {
    return 'vendor-sentry';
  }
  return undefined;
}

function nodePackageName(id: string): string | null {
  const marker = '/node_modules/';
  const index = id.lastIndexOf(marker);
  if (index === -1) return null;
  const [first, second] = id.slice(index + marker.length).split('/');
  if (!first) return null;
  return first.startsWith('@') && second ? `${first}/${second}` : first;
}

function safeChunkName(value: string): string {
  return value.replace(/^@/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

export default defineConfig({
  // Ensure import.meta.env.BASE_URL is '/agreements/' for routing + link generation.
  base: '/agreements/',
  build: {
    sourcemap: sentrySourcemapsEnabled ? 'hidden' : false,
    minify: 'esbuild',
    // The app chunk remains below Vite's default warning size after manualChunks.
    // The higher threshold is for wallet SDK vendor packages that are not app-owned code.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      onwarn(warning, warn) {
        // ox publishes PURE annotations that Rollup cannot safely preserve after Vite transforms.
        // This is dependency metadata noise; app-owned annotations still surface normally.
        if (warning.code === 'INVALID_ANNOTATION' && String(warning.id || '').includes('/node_modules/.pnpm/ox@')) {
          return;
        }

        // Turnkey's browser bundle references Node crypto exports behind runtime guards.
        // Vite externalizes node:crypto for the browser, so these guarded dependency imports warn during bundling.
        if (
          warning.code === 'MISSING_EXPORT' &&
          String(warning.id || '').includes('/node_modules/.pnpm/@turnkey') &&
          String(warning.message || '').includes('__vite-browser-external')
        ) {
          return;
        }

        warn(warning);
      },
      output: {
        manualChunks: manualChunkFor,
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
