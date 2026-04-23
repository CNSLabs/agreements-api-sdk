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

COPY packages ./packages
COPY apps ./apps

RUN pnpm --filter @cns-labs/agreements-api-client build
RUN pnpm --filter partner-api-playground build

FROM nginx:alpine AS production

COPY --from=build /workspace/apps/partner-api-playground/dist /usr/share/nginx/html
COPY apps/partner-api-playground/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
