FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /workspace

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/shodai-reference-app/frontend/package.json ./apps/shodai-reference-app/frontend/

# Install dependencies from package metadata only for better Docker layer caching.
RUN pnpm install --frozen-lockfile --filter shodai-reference-frontend...

FROM base AS build

# Vite needs more than Node's default heap when rendering the wallet-heavy
# production bundle in Docker.
ENV NODE_OPTIONS=--max-old-space-size=4096

# Accept build arguments for Vite environment variables
ARG VITE_DYNAMIC_ENVIRONMENT_ID
ARG VITE_AGREEMENTS_API_BASE_URL
ARG VITE_AUTH_API_URL
ARG VITE_INFURA_PROJECT_ID
ARG VITE_AGREEMENTS_RPC_URL
ARG VITE_AGREEMENTS_RPC_URL_1
ARG VITE_AGREEMENTS_RPC_URL_8453
ARG VITE_AGREEMENTS_RPC_URL_84532
ARG VITE_AGREEMENTS_RPC_URL_59141
ARG VITE_AGREEMENTS_RPC_URL_59144
ARG VITE_AGREEMENTS_RPC_URL_11155111
ARG VITE_MARKETING_TELEMETRY_ENABLED
ARG VITE_GA_MEASUREMENT_ID
ARG VITE_HUBSPOT_PORTAL_ID
ARG VITE_SENTRY_ENABLED
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_SENTRY_RELEASE
ARG VITE_SENTRY_TRACES_SAMPLE_RATE
ARG SENTRY_ORG
ARG SENTRY_PROJECT

# Set as environment variables for Vite build
ENV VITE_DYNAMIC_ENVIRONMENT_ID=$VITE_DYNAMIC_ENVIRONMENT_ID
ENV VITE_AGREEMENTS_API_BASE_URL=$VITE_AGREEMENTS_API_BASE_URL
ENV VITE_AUTH_API_URL=$VITE_AUTH_API_URL
ENV VITE_INFURA_PROJECT_ID=$VITE_INFURA_PROJECT_ID
ENV VITE_AGREEMENTS_RPC_URL=$VITE_AGREEMENTS_RPC_URL
ENV VITE_AGREEMENTS_RPC_URL_1=$VITE_AGREEMENTS_RPC_URL_1
ENV VITE_AGREEMENTS_RPC_URL_8453=$VITE_AGREEMENTS_RPC_URL_8453
ENV VITE_AGREEMENTS_RPC_URL_84532=$VITE_AGREEMENTS_RPC_URL_84532
ENV VITE_AGREEMENTS_RPC_URL_59141=$VITE_AGREEMENTS_RPC_URL_59141
ENV VITE_AGREEMENTS_RPC_URL_59144=$VITE_AGREEMENTS_RPC_URL_59144
ENV VITE_AGREEMENTS_RPC_URL_11155111=$VITE_AGREEMENTS_RPC_URL_11155111
ENV VITE_MARKETING_TELEMETRY_ENABLED=$VITE_MARKETING_TELEMETRY_ENABLED
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
ENV VITE_HUBSPOT_PORTAL_ID=$VITE_HUBSPOT_PORTAL_ID
ENV VITE_SENTRY_ENABLED=$VITE_SENTRY_ENABLED
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
ENV VITE_SENTRY_TRACES_SAMPLE_RATE=$VITE_SENTRY_TRACES_SAMPLE_RATE
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

# Remove node_modules and dist to avoid conflicts when copying source.
RUN rm -rf apps/shodai-reference-app/frontend/node_modules apps/shodai-reference-app/frontend/dist

# Copy source code
COPY apps/shodai-reference-app/frontend ./apps/shodai-reference-app/frontend

# Reinstall after source copy, matching the existing frontend image pattern.
RUN pnpm install --frozen-lockfile --filter shodai-reference-frontend...
RUN pnpm rebuild @sentry/cli

# Build the application using workspace filter.
RUN --mount=type=secret,id=sentry_auth_token,required=false \
  export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" && \
  pnpm --filter shodai-reference-frontend build
RUN find /workspace/apps/shodai-reference-app/frontend/dist -type f -name '*.map' -delete

FROM nginx:alpine AS production

# Copy built assets
COPY --from=build /workspace/apps/shodai-reference-app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/shodai-reference-app/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
