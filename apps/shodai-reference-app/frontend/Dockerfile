FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/

RUN pnpm install --frozen-lockfile --filter ./frontend...

FROM base AS build

ARG VITE_DYNAMIC_ENVIRONMENT_ID
ARG VITE_INFURA_PROJECT_ID
ARG VITE_SENTRY_ENABLED
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_SENTRY_RELEASE
ARG SENTRY_ORG
ARG SENTRY_PROJECT

# Set as environment variables for Vite build
ENV VITE_DYNAMIC_ENVIRONMENT_ID=$VITE_DYNAMIC_ENVIRONMENT_ID
ENV VITE_INFURA_PROJECT_ID=$VITE_INFURA_PROJECT_ID
ENV VITE_SENTRY_ENABLED=$VITE_SENTRY_ENABLED
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_SENTRY_ENVIRONMENT=$VITE_SENTRY_ENVIRONMENT
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

COPY frontend ./frontend
RUN pnpm install --frozen-lockfile --filter ./frontend...
RUN pnpm rebuild @sentry/cli

RUN --mount=type=secret,id=sentry_auth_token,required=false \
  export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" && \
  pnpm --filter ./frontend build
RUN find /app/frontend/dist -type f -name '*.map' -delete

FROM nginx:alpine AS production

COPY --from=build /app/frontend/dist /usr/share/nginx/html

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
