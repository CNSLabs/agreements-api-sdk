FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agreements-api-client/package.json ./packages/agreements-api-client/
COPY apps/shodai-reference-app/package.json ./apps/shodai-reference-app/
COPY apps/shodai-reference-app/backend/package.json ./apps/shodai-reference-app/backend/

RUN pnpm install --frozen-lockfile \
  --filter @cns-labs/agreements-api-client... \
  --filter shodai-reference-backend...

FROM base AS build

COPY packages/agreements-api-client ./packages/agreements-api-client
COPY apps/shodai-reference-app ./apps/shodai-reference-app

RUN pnpm --filter @cns-labs/agreements-api-client build
RUN pnpm --filter shodai-reference-backend build

FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agreements-api-client/package.json ./packages/agreements-api-client/
COPY apps/shodai-reference-app/package.json ./apps/shodai-reference-app/
COPY apps/shodai-reference-app/backend/package.json ./apps/shodai-reference-app/backend/

COPY --from=build /workspace/packages/agreements-api-client/dist ./packages/agreements-api-client/dist

RUN pnpm install --frozen-lockfile --prod \
  --filter @cns-labs/agreements-api-client... \
  --filter shodai-reference-backend...

RUN apk add --no-cache ca-certificates curl && \
  curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /etc/ssl/certs/rds-combined-ca-bundle.pem

ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-combined-ca-bundle.pem

COPY --from=build /workspace/apps/shodai-reference-app/backend/dist ./apps/shodai-reference-app/backend/dist

WORKDIR /workspace/apps/shodai-reference-app

CMD ["pnpm", "backend:start:prod"]
