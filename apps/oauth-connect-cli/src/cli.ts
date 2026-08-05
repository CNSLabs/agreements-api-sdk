#!/usr/bin/env node

import { ApiClient } from '@shodai-network/agreements-api-client';
import {
  OauthDelegatedSession,
  type OauthDelegatedTokenSet,
} from '@shodai-network/agreements-api-client/oauth';
import { resolveConfig, type CliConfig } from './config.js';
import { deployWithLinkedWallet, resolveDeployOptions } from './deploy.js';
import {
  clearSession,
  defaultSessionPath,
  loadSession,
  saveSession,
  type StoredOauthSession,
} from './session-store.js';

const USAGE = `shodai-oauth — connect a public OAuth app to a Shodai user (authorization_code + PKCE)

Usage:
  shodai-oauth login [--no-browser]
  shodai-oauth status
  shodai-oauth agreements [--limit N]
  shodai-oauth deploy [options]
  shodai-oauth token
  shodai-oauth logout
  shodai-oauth help

Prerequisites:
  1. Create a public OAuth app in the developer portal (Profile → OAuth apps)
     with redirect URI: http://127.0.0.1/callback
  2. Export OAUTH_CLIENT_ID=cns_oa_...
  3. For deploy: link a signing wallet (Profile → Wallets → Link wallet)

Environment:
  OAUTH_CLIENT_ID                 required for login (or stored after login)
  OAUTH_ISSUER_URL                auth-api issuer (default http://localhost:4003/auth-api)
  OAUTH_AUTHORIZATION_PAGE_URL    consent page (discovered from metadata when omitted)
  EXTERNAL_API_BASE_URL           Agreements API base (default http://localhost:4005/api)
  OAUTH_SCOPES                    optional space-separated scopes at authorize time
  SHODAI_OAUTH_SESSION_PATH       session file (default ~/.config/shodai/oauth-session.json)
  LINKED_WALLET_PRIVATE_KEY       signing key for deploy (alias: WALLET_PRIVATE_KEY)
  AGREEMENTS_RPC_URL              RPC for deploy (default: public Linea Sepolia)
  AGREEMENT_JSON_PATH             agreement template JSON (default: bundled MOU)

deploy options:
  --wallet-key 0x...              override LINKED_WALLET_PRIVATE_KEY
  --agreement <path>              agreement JSON (default: fixtures/mou.json)
  --chain-id <n>                  default 59141 (Linea Sepolia)
  --rpc-url <url>                 chain RPC
  --counterparty 0x...            party B wallet
  --name <string>                 agreement display name
  --party-a-key / --party-b-key   participant variable keys (MOU defaults)
`;

async function main(): Promise<void> {
  // pnpm sometimes forwards a literal "--" separator; drop it.
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const command = args[0] || 'help';
  const flags = new Set(args.slice(1).filter((arg) => arg.startsWith('--')));

  switch (command) {
    case 'login':
      await cmdLogin({ openBrowser: !flags.has('--no-browser') });
      break;
    case 'status':
      cmdStatus();
      break;
    case 'agreements':
      await cmdAgreements(parseLimit(args));
      break;
    case 'deploy':
      await cmdDeploy(args.slice(1));
      break;
    case 'token':
      await cmdToken();
      break;
    case 'logout':
      await cmdLogout();
      break;
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(USAGE);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stdout.write(USAGE);
      process.exit(1);
  }
}

function parseLimit(args: string[]): number {
  const idx = args.indexOf('--limit');
  if (idx >= 0 && args[idx + 1]) {
    const value = Number(args[idx + 1]);
    if (Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return 5;
}

async function cmdLogin(options: { openBrowser: boolean }): Promise<void> {
  const config = resolveConfig();
  if (!config.clientId) {
    console.error('OAUTH_CLIENT_ID is required. Create an app in the developer portal first.');
    console.error('Redirect URI to register: http://127.0.0.1/callback');
    process.exit(1);
  }

  const sessionPath = defaultSessionPath();
  const session = new OauthDelegatedSession({
    clientId: config.clientId,
    issuer: config.issuer,
    authorizationPageUrl: config.authorizationPageUrl,
    scope: config.scope,
    onTokensUpdated: async (tokens) => {
      persist(config, tokens, sessionPath);
    },
  });

  console.log(`Issuer:   ${config.issuer}`);
  console.log(`API base: ${config.apiBaseUrl}`);
  console.log(`Client:   ${config.clientId}`);
  console.log(`Session:  ${sessionPath}`);

  const tokens = await session.loginWithLoopback({ openBrowser: options.openBrowser });
  const claims = decodeJwtPayload(tokens.accessToken);
  console.log('\nConnected.');
  console.log(`  sub:     ${claims.sub ?? '(unknown)'}`);
  console.log(`  scope:   ${tokens.scope ?? claims.scope ?? '(default)'}`);
  console.log(`  expires: ${new Date(tokens.expiresAt).toISOString()}`);
  console.log(`\nSession saved to ${sessionPath}`);
  console.log('Try: shodai-oauth agreements');
  console.log(
    'Deploy (after linking a wallet): LINKED_WALLET_PRIVATE_KEY=0x... shodai-oauth deploy',
  );
}

function cmdStatus(): void {
  const stored = requireSession();
  const expired = stored.tokens.expiresAt <= Date.now();
  console.log(`Client:   ${stored.clientId}`);
  console.log(`Issuer:   ${stored.issuer}`);
  console.log(`API base: ${stored.apiBaseUrl}`);
  console.log(`Scope:    ${stored.tokens.scope ?? '(unknown)'}`);
  console.log(`Access:   ${expired ? 'expired' : 'valid until ' + new Date(stored.tokens.expiresAt).toISOString()}`);
  console.log(`Refresh:  ${stored.tokens.refreshToken ? 'present' : 'missing'}`);
  console.log(`Updated:  ${stored.updatedAt}`);
  console.log(`File:     ${defaultSessionPath()}`);
}

async function cmdAgreements(limit: number): Promise<void> {
  const { client } = await sessionClient();
  const page = await client.listAgreements({ limit });
  console.log(`${page.data.length} agreement(s)${page.pageInfo?.nextCursor ? ' (more pages available)' : ''}`);
  for (const agreement of page.data) {
    console.log(`  - ${agreement.id}  ${agreement.status ?? ''}  ${agreement.displayName ?? ''}`);
  }
}

async function cmdDeploy(args: string[]): Promise<void> {
  const options = resolveDeployOptions(args);
  const { client } = await sessionClient();
  console.log('Deploying with delegated OAuth session + linked wallet ...');
  const deployed = await deployWithLinkedWallet(client, options);
  const read = await client.getAgreement(deployed.id);
  console.log('\nDeployed.');
  console.log(`  agreementId:  ${deployed.id}`);
  console.log(`  address:      ${deployed.address ?? '(none)'}`);
  console.log(`  chainId:      ${deployed.chainId ?? options.chainId}`);
  console.log(`  status:       ${read.status ?? '(unknown)'}`);
  console.log(`  signer:       ${deployed.signerAddress}`);
  console.log(`  partyB:       ${options.counterparty}`);
}

async function cmdToken(): Promise<void> {
  const { session } = await sessionClient();
  const token = await session.getAccessToken();
  process.stdout.write(`${token}\n`);
}

async function cmdLogout(): Promise<void> {
  const stored = loadSession();
  if (!stored) {
    console.log('No session on disk.');
    return;
  }
  const session = new OauthDelegatedSession({
    clientId: stored.clientId,
    issuer: stored.issuer,
  });
  session.restoreTokens(stored.tokens);
  try {
    await session.revoke();
    console.log('Revoked refresh token family on the authorization server.');
  } catch (error) {
    console.error(
      `Revoke request failed (${error instanceof Error ? error.message : String(error)}); clearing local session anyway.`,
    );
  }
  clearSession();
  console.log(`Cleared ${defaultSessionPath()}`);
}

function requireSession(): StoredOauthSession {
  const stored = loadSession();
  if (!stored) {
    console.error(`No session at ${defaultSessionPath()}. Run: shodai-oauth login`);
    process.exit(1);
  }
  return stored;
}

async function sessionClient(): Promise<{ session: OauthDelegatedSession; client: ApiClient }> {
  const stored = requireSession();
  const session = new OauthDelegatedSession({
    clientId: stored.clientId,
    issuer: stored.issuer,
    onTokensUpdated: async (tokens) => {
      persist(
        {
          clientId: stored.clientId,
          issuer: stored.issuer,
          apiBaseUrl: stored.apiBaseUrl,
        },
        tokens,
      );
    },
  });
  session.restoreTokens(stored.tokens);
  const client = new ApiClient({
    baseUrl: stored.apiBaseUrl,
    tokenProvider: session.tokenProvider(),
  });
  return { session, client };
}

function persist(config: CliConfig, tokens: OauthDelegatedTokenSet, path = defaultSessionPath()): void {
  saveSession(
    {
      clientId: config.clientId,
      issuer: config.issuer,
      apiBaseUrl: config.apiBaseUrl,
      tokens,
      updatedAt: new Date().toISOString(),
    },
    path,
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1];
    if (!part) {
      return {};
    }
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
