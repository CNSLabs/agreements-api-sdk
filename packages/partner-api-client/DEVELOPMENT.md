# Partner API Client Development

Maintainer notes for `@cns-labs/agreements-api-client`.

## Role in the Repository

This package is the typed client for the CNS Partner API. It is also used by `apps/partner-api-playground`.

When partner API routes, payloads, status codes, or path prefixes change, update this package in the same change set so the playground and external consumers stay aligned.

Primary files to check:

- `src/client.ts`
- `src/types.ts`
- `src/constants.ts`
- `src/utils.ts`
- `src/viem.ts`

## Local Commands

Build:

```bash
pnpm --filter @cns-labs/agreements-api-client run build
```

Typecheck:

```bash
pnpm --filter @cns-labs/agreements-api-client run lint
```

## Publishing

Release from `packages/partner-api-client`:

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
