# oauth-connect-cli (`shodai-oauth`)

Open-source companion CLI that performs the **delegated OAuth** flow
(`authorization_code` + PKCE) against Shodai’s authorization server, stores a
refreshable session on disk, and calls the Agreements API as the signed-in
user via `@shodai-network/agreements-api-client`.

This is the reference “app that receives `/callback`” for builders who want
user-delegated access without standing up their own web server. It is distinct
from:

- **API keys** / hosted MCP bearer keys
- **Agent identity** OAuth (`client_credentials` + private JWK) used by autonomous agents

## Client ID routes (both supported)

The CLI always uses **authorization_code + PKCE**. `OAUTH_CLIENT_ID` may be
either:

| Route | Example | Notes |
| --- | --- | --- |
| **Registered app** | `cns_oa_…` | Create under Profile → **OAuth apps** with redirect `http://127.0.0.1/callback` |
| **CIMD** | `https://host/oauth/client.json` | AS fetches the Client ID Metadata Document; document must allow the loopback redirect |

Same login, session file, `agreements`, and `deploy` commands for both.

## Prerequisites

1. A Shodai environment with delegated OAuth enabled (local stack or hosted).
2. A public client id — **either**:
   - a portal **OAuth apps** `cns_oa_…` with redirect `http://127.0.0.1/callback`, **or**
   - an HTTPS CIMD URL whose document includes that loopback redirect.
3. For `deploy`: a wallet linked to the authorizing user (Profile → **Wallets**
   → **Link wallet**).

## Install / run from this monorepo

```bash
cd agreements-api-sdk
pnpm install
pnpm oauth help
```

You can also run the built binary directly:

```bash
pnpm --filter oauth-connect-cli build
node apps/oauth-connect-cli/dist/cli.js help
```

## Quick start — registered app

With `./start-dev.sh` (or equivalent) running and OAuth flags enabled:

```bash
export OAUTH_CLIENT_ID=cns_oa_...   # from Profile → OAuth apps

pnpm oauth login
pnpm oauth status
pnpm oauth agreements

# On-chain deploy (signer must already be linked: Profile → Wallets → Link wallet)
LINKED_WALLET_PRIVATE_KEY=0x... pnpm oauth deploy
```

`login` opens a browser to the consent page, waits on a loopback callback,
exchanges the code (PKCE), and writes the session to
`~/.config/shodai/oauth-session.json` (mode `0600`).

`deploy` reuses that session, signs a deploy permit with the linked wallet, and
calls `deploy-with-permit` (default: bundled MOU template on Linea Sepolia).

## Quick start — CIMD

Use when the client is advertised as an HTTPS metadata URL (MCP hosts, ngrok
tests). From the `cns-service` repo you can serve a sample document:

```bash
# cns-service repo
node scripts/oauth/serve-cimd-client.mjs
# other terminal: ngrok http 9090
# curl -sS https://<ngrok-host>/oauth/client.json | jq .
```

Then in this monorepo:

```bash
export OAUTH_CLIENT_ID=https://<ngrok-host>/oauth/client.json
# optional hosted overrides — see Environment below
pnpm oauth login
pnpm oauth agreements
LINKED_WALLET_PRIVATE_KEY=0x... pnpm oauth deploy
```

Internal E2E notes for both routes: `cns-service` → `scripts/oauth/README.md`
(section “Human delegated demo”).

## Pointing at production / hosted

Defaults are localhost. For Shodai production or hosted `dev`:

```bash
export OAUTH_CLIENT_ID=cns_oa_...   # or a CIMD https://… URL
export OAUTH_ISSUER_URL=https://app.shodai.network/auth-api
export EXTERNAL_API_BASE_URL=https://api.shodai.network
# optional if metadata discovery is unavailable:
# export OAUTH_AUTHORIZATION_PAGE_URL=https://developers.shodai.network/oauth/authorize

pnpm oauth login
pnpm oauth agreements
```

## Commands

| Command | Description |
| --- | --- |
| `login [--no-browser]` | Browser consent + PKCE; save session |
| `status` | Show client, issuer, expiry, session path |
| `agreements [--limit N]` | `GET /v0/agreements` as the connected user |
| `deploy [options]` | Sign + `deploy-with-permit` as the connected user |
| `token` | Print a fresh access token (refreshes if needed) |
| `logout` | Revoke the refresh-token family + delete local session |
| `help` | Usage |

### `deploy` options

| Flag / env | Purpose |
| --- | --- |
| `--wallet-key` / `LINKED_WALLET_PRIVATE_KEY` | EOA that signs the deploy permit (must be linked to the user) |
| `--agreement` / `AGREEMENT_JSON_PATH` | Agreement JSON (default: `fixtures/mou.json`) |
| `--chain-id` / `CHAIN_ID` | Default `59141` (Linea Sepolia) |
| `--rpc-url` / `AGREEMENTS_RPC_URL` | Chain RPC (default: public Linea Sepolia RPC) |
| `--counterparty` / `COUNTERPARTY_WALLET` | Party B address |
| `--name` / `DISPLAY_NAME` | Agreement display name |
| `--party-a-key` / `--party-b-key` | Participant variable keys (MOU defaults) |

## Environment

| Variable | Purpose |
| --- | --- |
| `OAUTH_CLIENT_ID` | Public client id: `cns_oa_…` **or** CIMD `https://…` URL (required for `login`) |
| `OAUTH_ISSUER_URL` | Auth-api issuer (default `http://localhost:4003/auth-api`) |
| `OAUTH_AUTHORIZATION_PAGE_URL` | Consent URL override (otherwise RFC 8414 metadata) |
| `EXTERNAL_API_BASE_URL` | Agreements API origin (production: `https://api.shodai.network`) |
| `OAUTH_SCOPES` | Optional space-separated scopes requested at authorize |
| `SHODAI_OAUTH_SESSION_PATH` | Override session file path |
| `LINKED_WALLET_PRIVATE_KEY` | Signing key for `deploy` (alias `WALLET_PRIVATE_KEY`) |
| `AGREEMENTS_RPC_URL` | RPC for `deploy` |
| `AGREEMENT_JSON_PATH` | Agreement template path for `deploy` |

## Using the session from your own code

```ts
import { ApiClient } from '@shodai-network/agreements-api-client';
import { OauthDelegatedSession } from '@shodai-network/agreements-api-client/oauth';
import { readFileSync } from 'node:fs';

const stored = JSON.parse(readFileSync(process.env.HOME + '/.config/shodai/oauth-session.json', 'utf8'));

const session = new OauthDelegatedSession({
  clientId: stored.clientId,
  issuer: stored.issuer,
});
session.restoreTokens(stored.tokens);

const client = new ApiClient({
  baseUrl: stored.apiBaseUrl,
  tokenProvider: session.tokenProvider(),
});

await client.listAgreements({ limit: 5 });
```

For a one-shot on-chain deploy from this session:

```bash
LINKED_WALLET_PRIVATE_KEY=0x... pnpm oauth deploy
```

Programmatic compose examples (list + deploy in your own code) live in
[`packages/agreements-api-client/README.md`](../../packages/agreements-api-client/README.md#compose-examples).

The reusable helpers live in `@shodai-network/agreements-api-client/oauth`
(`OauthDelegatedSession`, `createDelegatedTokenProvider`).

## Managing access

- **As the app developer (registered apps):** Profile → **OAuth apps**.
- **As the authorizing user:** Profile → **Connected apps** (disconnect a grant).
- **CIMD:** rotate or take down the hosted metadata document; existing refresh
  grants still appear under Connected apps until disconnected or revoked.

## Notes

- Public client: there is **no client secret**; PKCE is mandatory.
- Access tokens are short-lived; the CLI refreshes via the stored refresh token
  (rotation is handled by the authorization server).
- `logout` calls RFC 7009 revoke when the server advertises a revocation
  endpoint, then deletes the local file.
