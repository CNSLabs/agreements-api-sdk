import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jose from 'jose';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { DynamicUser } from './auth.types';

@Injectable()
export class AuthService {
  private jwks: jose.JSONWebKeySet | null = null;

  constructor(private readonly config: StandaloneConfigService) {}

  async validateDynamicToken(token: string): Promise<DynamicUser> {
    if (!token || typeof token !== 'string') throw new UnauthorizedException('Invalid Dynamic token');
    if (token.startsWith('agreements-dev:')) {
      if (this.config.nodeEnv !== 'test') {
        throw new UnauthorizedException('Development Dynamic tokens are disabled');
      }
      return this.parseDevToken(token);
    }

    if (!this.config.dynamicEnvironmentId) throw new UnauthorizedException('Missing DYNAMIC_ENVIRONMENT_ID');
    if (!this.jwks) this.jwks = await this.loadJwks();

    let payload: jose.JWTPayload;
    try {
      ({ payload } = await jose.jwtVerify(token, jose.createLocalJWKSet(this.jwks), {
        issuer: `app.dynamicauth.com/${this.config.dynamicEnvironmentId}`,
      }));
    } catch {
      throw new UnauthorizedException('Invalid Dynamic token');
    }

    return this.dynamicUserFromPayload(payload as Record<string, unknown>);
  }

  private async loadJwks(): Promise<jose.JSONWebKeySet> {
    const response = await fetch(`https://app.dynamic.xyz/api/v0/sdk/${this.config.dynamicEnvironmentId}/.well-known/jwks`);
    if (!response.ok) throw new UnauthorizedException('Unable to load Dynamic JWKS');
    return response.json() as Promise<jose.JSONWebKeySet>;
  }

  private parseDevToken(token: string): DynamicUser {
    const payload = JSON.parse(Buffer.from(token.slice('agreements-dev:'.length), 'base64url').toString('utf8'));
    return this.dynamicUserFromPayload({
      sub: payload.userId || payload.sub || 'agreements-dev-user',
      email: payload.email,
      verified_credentials: [
        ...(payload.verifiedCredentials || []),
        ...((payload.wallets || []).map((wallet: Record<string, unknown>) => ({ format: 'blockchain', ...wallet }))),
      ],
    });
  }

  private dynamicUserFromPayload(payload: Record<string, unknown>): DynamicUser {
    const credentials = Array.isArray(payload.verified_credentials) ? payload.verified_credentials : [];
    const wallets = credentials.filter((entry: any) => entry?.format === 'blockchain' && entry.address);
    return {
      email: payload.email as string | undefined,
      userId: String(payload.sub || payload.userId || ''),
      verifiedCredentials: credentials.filter((entry: any) => entry?.format !== 'blockchain'),
      wallets: wallets.map((wallet: any) => ({
        address: wallet.address,
        chain: wallet.chain,
        wallet_name: wallet.wallet_name,
        wallet_provider: wallet.wallet_provider,
      })),
    };
  }
}
