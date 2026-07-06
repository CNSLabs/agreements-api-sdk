# Hosted MCP server for the Agreements API (Streamable HTTP).
# Build context: the agreements-api-sdk repository root.
FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agreements-api-client/package.json ./packages/agreements-api-client/
COPY packages/agreements-mcp-server/package.json ./packages/agreements-mcp-server/

RUN pnpm install --frozen-lockfile --ignore-scripts \
  --filter @shodai-network/agreements-api-client \
  --filter @shodai-network/agreements-mcp-server...

FROM base AS build

COPY packages/agreements-api-client/tsconfig.json ./packages/agreements-api-client/
COPY packages/agreements-api-client/src ./packages/agreements-api-client/src
COPY packages/agreements-mcp-server/tsconfig.json ./packages/agreements-mcp-server/
COPY packages/agreements-mcp-server/src ./packages/agreements-mcp-server/src
COPY packages/agreements-mcp-server/content ./packages/agreements-mcp-server/content

RUN pnpm --filter @shodai-network/agreements-api-client build \
  && pnpm --filter @shodai-network/agreements-mcp-server build

FROM node:20-alpine AS production

ENV NODE_ENV=production
ENV PORT=3905

COPY --from=build /workspace /workspace

WORKDIR /workspace/packages/agreements-mcp-server

EXPOSE 3905

CMD ["node", "dist/http-main.js"]
