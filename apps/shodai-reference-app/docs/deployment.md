# Deployment Notes

This app is split into a Nest backend and a Vite React frontend. The frontend is built for the `/agreements/` base path.

## Backend

Run the backend as a long-lived Node process:

```sh
pnpm --filter shodai-reference-app backend:start
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
Webhook processing is asynchronous after signature verification and receipt persistence. Optional `SHODAI_WEBHOOK_PROCESSOR_*` environment values in `backend/.env.sample` tune polling, retry, and lease behavior.

## Frontend

Build the frontend:

```sh
pnpm --filter shodai-reference-app frontend:build
```

Build the frontend container from the SDK repo root:

```sh
docker build -f apps/shodai-reference-app/frontend/Dockerfile .
```

Serve `frontend/dist` at `/agreements/`.
The repo includes `frontend/nginx.conf` as a concrete static-serving reference.

Required frontend environment at build time:

- `VITE_DYNAMIC_ENVIRONMENT_ID`
- `VITE_AGREEMENTS_API_BASE_URL`
- `VITE_AUTH_API_URL`
- optional RPC support via `VITE_INFURA_PROJECT_ID`, `VITE_AGREEMENTS_RPC_URL`, or per-chain `VITE_AGREEMENTS_RPC_URL_<chainId>`

Optional Sentry values are listed in `frontend/.env.sample`. Marketing telemetry
is disabled by default; only set `VITE_MARKETING_TELEMETRY_ENABLED=true` with
your own `VITE_GA_MEASUREMENT_ID` and/or `VITE_HUBSPOT_PORTAL_ID` when a
deployment intentionally opts in.

When building the frontend container, pass build args for any browser-bundled
values your deployment needs:

```sh
docker build -f apps/shodai-reference-app/frontend/Dockerfile \
  --build-arg VITE_DYNAMIC_ENVIRONMENT_ID=<dynamic-env-id> \
  --build-arg VITE_AGREEMENTS_API_BASE_URL=https://example.com \
  --build-arg VITE_AUTH_API_URL=https://example.com/auth-api \
  --build-arg VITE_AGREEMENTS_RPC_URL_59141=<linea-sepolia-rpc-url> \
  .
```

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

Users can create agreements from all visible vendored templates by default. To pin an explicit persisted default list for an environment, seed global template access once:

```sh
MONGO_URI=<mongo-uri> MONGO_DB_NAME=<db-name> pnpm --filter shodai-reference-app templates:seed-defaults
```

This writes the current vendored template IDs into the `template_access` collection as `kind: global-default`. If the row is absent, the backend falls back to the visible templates from `data/agreement-templates`.

## Notification Delivery

Configure the Shodai webhook subscription with both event types:

```text
agreement.transitioned
agreement.notification.triggered
```

The reference backend verifies both event types with `SHODAI_WEBHOOK_SECRET`.
Transition events reconcile the local agreement mirror. Notification-triggered
events are delivered as email through AWS SES using `AWS_REGION`,
`SES_FROM_ADDRESS`, and optional `SES_CONFIGURATION_SET`.

Notification templates are read from `data/notification-templates` when present,
or from `NOTIFICATION_TEMPLATES_DIR` when overridden. During deployment, matching
templates are sent to the external API using the `external_webhook` channel so
hosted Shodai services evaluate the rules while this app owns final email
delivery.

## Validation

Before exposing the deployment:

- `GET /health` returns `ok: true`
- frontend loads under `/agreements/`
- login works through Dynamic
- Create Agreement shows expected templates
- deploy and action submission work against the configured Shodai API
- signed Shodai webhook deliveries for `agreement.transitioned` and
  `agreement.notification.triggered` reach `POST /shodai/webhooks`
- an `agreement.notification.triggered` delivery records a
  `notification_deliveries` document and sends through SES
- `/notifications-api/*` and `/auth-api/auth/notify/*` are not present
