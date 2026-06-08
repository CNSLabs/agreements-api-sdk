import { Injectable, OnModuleInit } from '@nestjs/common';
import { listDeployments } from '@cns-labs/agreements-protocol-evm';

type AgreementsApiEnvironment = 'testnet' | 'production';

const TESTNET_CHAIN_IDS = new Set([59141, 84532, 11155111]);
const PRODUCTION_CHAIN_IDS = new Set([59144, 8453]);

@Injectable()
export class StandaloneConfigService implements OnModuleInit {
  readonly nodeEnv = process.env.NODE_ENV || 'development';
  readonly port = Number(process.env.AGREEMENTS_BACKEND_PORT || 4199);
  readonly mongoUri = process.env.MONGO_URI || '';
  readonly mongoDbName = process.env.MONGO_DB_NAME || process.env.MONGO_DB || '';
  readonly dynamicEnvironmentId =
    process.env.DYNAMIC_ENVIRONMENT_ID ||
    process.env.VITE_DYNAMIC_ENVIRONMENT_ID ||
    '';
  readonly dynamicApiToken = process.env.DYNAMIC_API_TOKEN || '';
  readonly externalApiBaseUrl = process.env.EXTERNAL_API_BASE_URL || '';
  readonly externalApiKey = process.env.EXTERNAL_API_KEY || '';
  readonly allowLocalExternalApi = booleanFlag(process.env.ALLOW_LOCAL_EXTERNAL_API);
  readonly externalApiEnvironment = this.resolveExternalApiEnvironment();
  readonly shodaiWebhookSecret = process.env.SHODAI_WEBHOOK_SECRET || '';
  readonly shodaiWebhookToleranceSeconds = this.resolveWebhookToleranceSeconds();
  readonly webhookProcessorIntervalMs = positiveInteger(process.env.SHODAI_WEBHOOK_PROCESSOR_INTERVAL_MS, 1000);
  readonly webhookProcessorMaxAttempts = positiveInteger(process.env.SHODAI_WEBHOOK_PROCESSOR_MAX_ATTEMPTS, 5);
  readonly webhookProcessorRetryBaseMs = positiveInteger(process.env.SHODAI_WEBHOOK_PROCESSOR_RETRY_BASE_MS, 1000);
  readonly webhookProcessorRetryMaxMs = positiveInteger(process.env.SHODAI_WEBHOOK_PROCESSOR_RETRY_MAX_MS, 15 * 60 * 1000);
  readonly webhookProcessorLeaseMs = positiveInteger(process.env.SHODAI_WEBHOOK_PROCESSOR_LEASE_SECONDS, 120) * 1000;
  readonly frontendBaseUrl = process.env.FRONTEND_BASE_URL || (this.nodeEnv === 'test' ? 'http://localhost:5184/agreements/' : '');
  readonly serviceAuthToken = process.env.SERVICE_AUTH_TOKEN || '';
  readonly temporalSweepInterval = process.env.TEMPORAL_SWEEP_INTERVAL || '1 minute';
  readonly defaultAgreementChainId = this.resolveDefaultAgreementChainId();

  onModuleInit() {
    if (this.nodeEnv === 'test') return;

    const missing = [
      ['MONGO_URI', this.mongoUri],
      ['MONGO_DB_NAME', this.mongoDbName],
      ['DYNAMIC_ENVIRONMENT_ID', this.dynamicEnvironmentId],
      ['DYNAMIC_API_TOKEN', this.dynamicApiToken],
      ['EXTERNAL_API_BASE_URL', this.externalApiBaseUrl],
      ['EXTERNAL_API_KEY', this.externalApiKey],
      ['SHODAI_WEBHOOK_SECRET', this.shodaiWebhookSecret],
      ['FRONTEND_BASE_URL', this.frontendBaseUrl],
      ['SERVICE_AUTH_TOKEN', this.serviceAuthToken],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Missing required Shodai reference app config: ${missing.join(', ')}`);
    }

    if (this.externalApiBaseUrl === 'mock') {
      throw new Error('EXTERNAL_API_BASE_URL=mock is only allowed under NODE_ENV=test');
    }

    if (this.isLocalOrPrivateExternalApiUrl(this.externalApiBaseUrl) && !this.allowLocalExternalApi) {
      throw new Error('EXTERNAL_API_BASE_URL must target the real Shodai API unless ALLOW_LOCAL_EXTERNAL_API=true is set');
    }

    if (this.isLocalOrPrivateExternalApiUrl(this.externalApiBaseUrl) && this.nodeEnv === 'production') {
      throw new Error('ALLOW_LOCAL_EXTERNAL_API cannot be used when NODE_ENV=production');
    }
  }

  private isLocalOrPrivateExternalApiUrl(value: string) {
    if (!value) return false;
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || hostname === '[::1]' || hostname.endsWith('.local')) {
        return true;
      }
      if (hostname.startsWith('127.')) return true;
      const octets = hostname.split('.').map((part) => Number(part));
      if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
      }
      const [first, second] = octets;
      return first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254);
    } catch {
      return false;
    }
  }

  getSupportedAgreementChains() {
    const allowed = this.externalApiEnvironment === 'production' ? PRODUCTION_CHAIN_IDS : TESTNET_CHAIN_IDS;
    return listDeployments()
      .map((deployment) => ({
        chainId: Number(deployment.chainId),
        network: deployment.network,
        factoryAddress: deployment.factory,
      }))
      .filter((deployment) => allowed.has(deployment.chainId))
      .sort((a, b) => a.chainId - b.chainId);
  }

  isSupportedAgreementChainId(chainId: number) {
    return this.getSupportedAgreementChains().some((chain) => chain.chainId === chainId);
  }

  normalizeAgreementChainId(value: unknown) {
    const chainId = Number(value === undefined || value === null || value === '' ? this.defaultAgreementChainId : value);
    if (!Number.isInteger(chainId) || !this.isSupportedAgreementChainId(chainId)) {
      throw new Error(`Unsupported agreements chainId: ${value}`);
    }
    return chainId;
  }

  private resolveExternalApiEnvironment(): AgreementsApiEnvironment {
    const explicit = String(process.env.AGREEMENTS_API_ENVIRONMENT || '').trim().toLowerCase();
    if (explicit === 'production' || explicit === 'testnet') return explicit;
    if (this.externalApiBaseUrl === 'mock') return 'testnet';
    try {
      const hostname = new URL(this.externalApiBaseUrl).hostname.toLowerCase();
      if (hostname === 'api.shodai.network') return 'production';
      if (hostname === 'test-api.shodai.network') return 'testnet';
    } catch {
      // Fall through to local/test default.
    }
    return this.nodeEnv === 'production' ? 'production' : 'testnet';
  }

  private resolveDefaultAgreementChainId() {
    const explicit = Number(process.env.DEFAULT_AGREEMENTS_CHAIN_ID || process.env.AGREEMENTS_DEFAULT_CHAIN_ID || '');
    const supported = this.getSupportedAgreementChains();
    if (Number.isInteger(explicit) && supported.some((chain) => chain.chainId === explicit)) {
      return explicit;
    }
    return supported[0]?.chainId || 59141;
  }

  private resolveWebhookToleranceSeconds() {
    const raw = process.env.SHODAI_WEBHOOK_TOLERANCE_SECONDS;
    if (raw === undefined || raw === '') return 300;
    const explicit = Number(raw);
    return Number.isFinite(explicit) && explicit >= 0 ? explicit : 300;
  }
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  const explicit = Number(raw || '');
  return Number.isInteger(explicit) && explicit > 0 ? explicit : fallback;
}

function booleanFlag(raw: string | undefined): boolean {
  return String(raw || '').trim().toLowerCase() === 'true';
}
