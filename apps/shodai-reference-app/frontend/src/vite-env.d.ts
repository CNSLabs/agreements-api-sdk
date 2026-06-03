/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DYNAMIC_ENVIRONMENT_ID: string;
  readonly VITE_INFURA_PROJECT_ID: string;
  readonly VITE_AGREEMENTS_API_BASE_URL: string;
  readonly VITE_AUTH_API_URL: string;
  readonly VITE_AGREEMENTS_RPC_URL?: string;
  readonly [key: `VITE_AGREEMENTS_RPC_URL_${number}`]: string | undefined;
  readonly VITE_SENTRY_ENABLED?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
