# Agreements API SDK

Open-source home for the CNS Labs partner API TypeScript client and the reference playground app built on top of it.

## Packages

- `packages/partner-api-client`: publishable npm package `@cns-labs/agreements-api-client`
- `apps/partner-api-playground`: sample Vite app for exercising the partner API and signed permit flows

## Development

```bash
# from the repository root
pnpm install
pnpm build
pnpm dev:playground
```

The playground defaults to `http://localhost:5176`.

If that port is already in use, start the playground on another port:

```bash
pnpm --filter partner-api-playground exec vite --host 127.0.0.1 --port 4176
```
