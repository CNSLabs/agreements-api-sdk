# Agreements API Client Development

Maintainer notes for `@shodai-network/agreements-api-client`.

## Role in the Repository

This package is the typed client for the Agreements API. It is also used by `apps/agreements-api-playground`.

When Agreements API routes, payloads, status codes, or path prefixes change, update this package in the same change set so the playground and external consumers stay aligned.

Primary files to check:

- `src/client.ts`
- `src/types.ts`
- `src/constants.ts`
- `src/utils.ts`
- `src/viem.ts`

## Local Commands

Build:

```bash
pnpm --filter @shodai-network/agreements-api-client run build
```

Typecheck:

```bash
pnpm --filter @shodai-network/agreements-api-client run lint
```

## Publishing

Release from `packages/agreements-api-client`:

```bash
npm version <new-version> --no-git-tag-version
pnpm pack
tar -xOf cns-labs-agreements-api-client-<new-version>.tgz package/package.json
pnpm publish --access public --no-git-checks
```

## Release Checks

- Confirm the packed manifest contains `dist/` and the consumer-facing `README.md`.
- `prepublishOnly` runs `pnpm run build`.
- npm versions are immutable, so already-published versions must always be bumped.
