# Deployment Notes

This app is split into a Nest backend and a Vite React frontend. The frontend is built for the `/agreements/` base path.

## Backend

Run the backend as a long-lived Node process:

```sh
pnpm --filter shodai-reference-backend start
```

Required backend environment:

- `AGREEMENTS_BACKEND_PORT`
- `MONGO_URI`
- `MONGO_DB_NAME`
- `FRONTEND_BASE_URL`
- `DYNAMIC_ENVIRONMENT_ID`
- `DYNAMIC_API_TOKEN`
- `EXTERNAL_API_BASE_URL`
- `EXTERNAL_API_KEY`
- `SHODAI_WEBHOOK_SECRET`
- `SERVICE_AUTH_TOKEN`

The backend must reach MongoDB and the real Shodai external API. Runtime `EXTERNAL_API_BASE_URL=mock` is test-only and is rejected outside tests.
Webhook deliveries must reach `POST /shodai/webhooks` on the backend over HTTPS. Store only the subscription secret returned by Shodai in `SHODAI_WEBHOOK_SECRET`; it is used for signature verification and must not be bundled into the frontend.

## Frontend

Build the frontend:

```sh
pnpm frontend:build
```

Serve `frontend/dist` at `/agreements/`.
The repo includes `frontend/nginx.conf` as a concrete static-serving reference.

Required frontend environment at build time:

- `VITE_DYNAMIC_ENVIRONMENT_ID`
- `VITE_AGREEMENTS_API_BASE_URL`
- `VITE_AUTH_API_URL`
- optional RPC support via `VITE_INFURA_PROJECT_ID`, `VITE_AGREEMENTS_RPC_URL`, or per-chain `VITE_AGREEMENTS_RPC_URL_<chainId>`

Optional Sentry values are listed in `frontend/.env.sample`.

## Reverse Proxy

A production-like proxy should route:

- `/agreements/` to the static frontend build
- `/agreements-api/` to the backend
- `/auth-api/` to the backend
- `/shodai/webhooks` to the backend

There are no notification API routes in this repo.
Because the frontend uses React Router and Vite `base: '/agreements/'`, every `/agreements/*` route must fall back to the built SPA `index.html` after trying static assets.

Example shape:

```nginx
location = /agreements {
  return 301 /agreements/;
}

location ~ ^/agreements(/|$) {
  root /path/to/frontend/dist;
  rewrite ^/agreements/?(.*)$ /$1 break;
  try_files $uri $uri/ /index.html;
}

location /agreements-api/ {
  proxy_pass http://127.0.0.1:4199;
}

location /auth-api/ {
  proxy_pass http://127.0.0.1:4199;
}

location = /shodai/webhooks {
  proxy_pass http://127.0.0.1:4199;
}
```

Adjust the static-file directive for your server layout. The important invariant is that the frontend is reachable at the same `/agreements/` base path used at build time.

## Dynamic Configuration

Configure the deployed frontend URL as an allowed origin/callback in Dynamic. The local development URL is:

```text
http://localhost:5184/agreements/
```

For deployed environments, use the deployed equivalent, such as:

```text
https://example.com/agreements/
```

## Template Access

For a new environment, seed global template access once:

```sh
MONGO_URI=<mongo-uri> MONGO_DB_NAME=<db-name> pnpm templates:seed-defaults
```

This writes the current vendored template IDs into the `template_access` collection as `kind: global-default`.

## Validation

Before exposing the deployment:

- `GET /health` returns `ok: true`
- frontend loads under `/agreements/`
- login works through Dynamic
- Create Agreement shows expected templates
- deploy and action submission work against the configured Shodai API
- a signed Shodai webhook test delivery reaches `POST /shodai/webhooks`
- `/notifications-api/*` and `/auth-api/auth/notify/*` are not present
