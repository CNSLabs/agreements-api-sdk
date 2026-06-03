import * as Sentry from '@sentry/react';

const sentryTracesSampleRate = Number(
  import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0',
);

const sentryEnabled =
  import.meta.env.PROD &&
  import.meta.env.VITE_SENTRY_ENABLED === 'true' &&
  Boolean(import.meta.env.VITE_SENTRY_DSN);

if (sentryEnabled) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'prod',
    release: import.meta.env.VITE_SENTRY_RELEASE,
    integrations: [
      Sentry.browserTracingIntegration({
        tracePropagationTargets: [
          /^\/(auth-api|agreements-api)/,
          /^https?:\/\/[^/]+\/(auth-api|agreements-api)/,
        ],
      }),
    ],
    tracesSampleRate: Number.isFinite(sentryTracesSampleRate)
      ? sentryTracesSampleRate
      : 0,
    initialScope: {
      tags: {
        app: 'agreements-ui',
      },
    },
  });
}

export { sentryEnabled };
