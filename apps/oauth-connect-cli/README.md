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

## Prerequisites

1. A Shodai environment with delegated OAuth enabled (local stack or
   [production](https://developers.shodai.network/portal)).
2. A **public OAuth app** you own — create one in the developer portal under
   **Profile → OAuth apps** (`/profile?tab=oauth-apps`).
3. Register this redirect URI on the app (any port is accepted at authorize time):

   ```text
   http://127.0.0.1/callback
   ```

4. Copy the app’s `client_id` (`cns_oa_...`).

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

## Quick start (local stack)

With `./start-dev.sh` (or equivalent) running and OAuth flags enabled:

```bash
export OAUTH_CLIENT_ID=cns_oa_...   # from Profile → OAuth apps

pnpm oauth login
pnpm oauth status
pnpm oauth agreements
```

`login` opens a browser to the consent page, waits on a loopback callback,
exchanges the code (PKCE), and writes the session to
`~/.config/shodai/oauth-session.json` (mode `0600`).

## Pointing at production

Defaults are localhost. For Shodai production:

```bash
export OAUTH_CLIENT_ID=cns_oa_...
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
| `token` | Print a fresh access token (refreshes if needed) |
| `logout` | Revoke the refresh-token family + delete local session |
| `help` | Usage |

## Environment

| Variable | Purpose |
| --- | --- |
| `OAUTH_CLIENT_ID` | Public client id (required for `login`) |
| `OAUTH_ISSUER_URL` | Auth-api issuer (default `http://localhost:4003/auth-api`) |
| `OAUTH_AUTHORIZATION_PAGE_URL` | Consent URL override (otherwise RFC 8414 metadata) |
| `EXTERNAL_API_BASE_URL` | Agreements API origin (production: `https://api.shodai.network`) |
| `OAUTH_SCOPES` | Optional space-separated scopes requested at authorize |
| `SHODAI_OAUTH_SESSION_PATH` | Override session file path |

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

The reusable helpers live in `@shodai-network/agreements-api-client/oauth`
(`OauthDelegatedSession`, `createDelegatedTokenProvider`).

## Managing access

- **As the app developer:** Profile → **OAuth apps** (edit redirect URIs, disable the app).
- **As the authorizing user:** Profile → **Connected apps** (disconnect a grant).

## Notes

- Public client: there is **no client secret**; PKCE is mandatory.
- Access tokens are short-lived; the CLI refreshes via the stored refresh token
  (rotation is handled by the authorization server).
- `logout` calls RFC 7009 revoke when the server advertises a revocation
  endpoint, then deletes the local file.
