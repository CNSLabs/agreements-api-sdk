# Multi-stage build for the Agreements API playground frontend
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agreements-api-client/package.json ./packages/agreements-api-client/
COPY apps/agreements-api-playground/package.json ./apps/agreements-api-playground/

RUN pnpm install --frozen-lockfile --ignore-scripts \
  --filter @cns-labs/agreements-api-client \
  --filter agreements-api-playground...

FROM base AS build

ARG VITE_AGREEMENTS_API_ENVIRONMENT

ENV VITE_AGREEMENTS_API_ENVIRONMENT=$VITE_AGREEMENTS_API_ENVIRONMENT

COPY packages/agreements-api-client/tsconfig.json ./packages/agreements-api-client/
COPY packages/agreements-api-client/src ./packages/agreements-api-client/src
COPY apps/agreements-api-playground/src ./apps/agreements-api-playground/src
COPY apps/agreements-api-playground/index.html ./apps/agreements-api-playground/
COPY apps/agreements-api-playground/nginx.conf ./apps/agreements-api-playground/
COPY apps/agreements-api-playground/vite.config.ts ./apps/agreements-api-playground/
COPY apps/agreements-api-playground/eslint.config.js ./apps/agreements-api-playground/
COPY apps/agreements-api-playground/tsconfig.json ./apps/agreements-api-playground/
COPY apps/agreements-api-playground/tsconfig.app.json ./apps/agreements-api-playground/
COPY apps/agreements-api-playground/tsconfig.node.json ./apps/agreements-api-playground/

RUN pnpm --filter @cns-labs/agreements-api-client build
RUN pnpm --filter agreements-api-playground build

FROM nginx:alpine AS production

COPY --from=build /workspace/apps/agreements-api-playground/dist /usr/share/nginx/html
COPY apps/agreements-api-playground/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
