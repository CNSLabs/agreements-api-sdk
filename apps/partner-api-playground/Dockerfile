# Multi-stage build for the partner API playground frontend
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/partner-api-client/package.json ./packages/partner-api-client/
COPY apps/partner-api-playground/package.json ./apps/partner-api-playground/

RUN pnpm install --frozen-lockfile --ignore-scripts \
  --filter @cns-labs/agreements-api-client \
  --filter partner-api-playground...

FROM base AS build

ARG VITE_AGREEMENTS_CHAIN_ID
ARG VITE_AGREEMENTS_RPC_URL
ARG VITE_INFURA_PROJECT_ID
ARG VITE_PARTNER_API_BASE_URL
ARG VITE_DEVELOPER_DOCS_BASE_PATH
ARG VITE_PARTNER_DOCS_BASE_PATH

ENV VITE_AGREEMENTS_CHAIN_ID=$VITE_AGREEMENTS_CHAIN_ID
ENV VITE_AGREEMENTS_RPC_URL=$VITE_AGREEMENTS_RPC_URL
ENV VITE_INFURA_PROJECT_ID=$VITE_INFURA_PROJECT_ID
ENV VITE_PARTNER_API_BASE_URL=$VITE_PARTNER_API_BASE_URL
ENV VITE_DEVELOPER_DOCS_BASE_PATH=$VITE_DEVELOPER_DOCS_BASE_PATH
ENV VITE_PARTNER_DOCS_BASE_PATH=$VITE_PARTNER_DOCS_BASE_PATH

COPY packages/partner-api-client/tsconfig.json ./packages/partner-api-client/
COPY packages/partner-api-client/src ./packages/partner-api-client/src
COPY apps/partner-api-playground/src ./apps/partner-api-playground/src
COPY apps/partner-api-playground/index.html ./apps/partner-api-playground/
COPY apps/partner-api-playground/nginx.conf ./apps/partner-api-playground/
COPY apps/partner-api-playground/vite.config.ts ./apps/partner-api-playground/
COPY apps/partner-api-playground/eslint.config.js ./apps/partner-api-playground/
COPY apps/partner-api-playground/tsconfig.json ./apps/partner-api-playground/
COPY apps/partner-api-playground/tsconfig.app.json ./apps/partner-api-playground/
COPY apps/partner-api-playground/tsconfig.node.json ./apps/partner-api-playground/

RUN pnpm --filter @cns-labs/agreements-api-client build
RUN pnpm --filter partner-api-playground build

FROM nginx:alpine AS production

COPY --from=build /workspace/apps/partner-api-playground/dist /usr/share/nginx/html
COPY apps/partner-api-playground/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
