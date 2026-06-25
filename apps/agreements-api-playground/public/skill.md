---
name: shodai-agreements-api-playground
description: Use when starting from developers.shodai.network/api-playground to run browser API experiments, route technical work to the Shodai docs, route API-key access to the developer portal, or route product exploration to the Agreements app.
metadata:
  version: "1.0"
---

# Shodai Agreements API Playground Skill

Use this skill when the user or agent starts from `https://developers.shodai.network/api-playground/`.

The API Playground is a browser workspace for Agreements API requests, validation, deployment, inspection, and input submission. Technical builder work belongs in the Shodai Developer Documentation at `https://docs.shodai.network`.

## Route by intent

For browser API experimentation, stay in the playground:

- `https://developers.shodai.network/api-playground/`

For product/API behavior, load:

- `https://docs.shodai.network/skill.md`
- `https://docs.shodai.network/llms.txt`
- relevant page-level Markdown exports such as `https://docs.shodai.network/integration-surfaces.md`, `https://docs.shodai.network/sdks/quickstart-with-typescript-sdk.md`, and `https://docs.shodai.network/sdks/quickstart-with-mcp.md`
- `https://docs.shodai.network/openapi.json`

For API-key access or key management, route to:

- `https://developers.shodai.network/portal`

For product demo exploration, route to:

- `https://app.shodai.network/agreements`

## Default behavior

If the user asks how to build, integrate, sign, deploy, submit inputs, inspect state, or debug API behavior, continue in the docs. If the user asks to issue browser requests with a key they control, use the playground.

Do not infer API routes, agreement JSON shapes, state IDs, input IDs, issuer rules, signing payloads, lifecycle behavior, credentials, or access policy from the playground UI. Use the docs skill, page-level Markdown exports, OpenAPI, SDK docs, and retrieved agreement records.
