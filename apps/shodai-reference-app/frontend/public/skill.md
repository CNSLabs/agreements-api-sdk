---
name: shodai-reference-app
description: Use when starting from a deployed Shodai Reference App to explore the product workflow, inspect app-visible agreement behavior, or route technical/API tasks to the Shodai docs.
metadata:
  version: "1.0"
---

# Shodai Reference App Skill

Use this skill when the user or agent starts from this deployment's `/agreements/` app.

The Shodai Reference App is the product workflow surface for templates, drafts, deployed agreements, signing, available actions, local persistence, and webhook reconciliation. Technical builder work belongs in the Shodai Developer Documentation at `https://docs.shodai.network`.

## Classify the task

Choose the user's primary need:

- Explore the product UI
- Understand app-visible agreement behavior
- Build with the Agreements API or TypeScript SDK
- Get or manage an API key
- Try API requests in a browser
- Debug signing, deployment, input submission, state, auth, SDK, or API behavior

## Route by intent

For product UI exploration, stay in the app:

- `/agreements/` on the current deployment origin

For product/API behavior, load:

- `https://docs.shodai.network/skill.md`
- `https://docs.shodai.network/llms.txt`
- relevant page-level Markdown exports such as `https://docs.shodai.network/sdks/quickstart-with-typescript-sdk.md` and `https://docs.shodai.network/sdks/quickstart-with-mcp.md`
- `https://docs.shodai.network/openapi.json`

For API-key access or key management, route to:

- `https://developers.shodai.network/portal`

For browser-based API experimentation, route to:

- `https://developers.shodai.network/api-playground/`

## Default behavior

If the user asks about visible product behavior, inspect the app UI and current route. If the user asks how to build, integrate, sign, deploy, submit inputs, inspect state, or debug API behavior, continue in the docs.

If the user is unauthenticated and the task requires product UI access, sign-in is required. Do not ask for credentials directly; let the user complete the app's authentication flow.

Do not infer API routes, agreement JSON shapes, state IDs, input IDs, issuer rules, signing payloads, lifecycle behavior, credentials, or access policy from the app UI. Use the docs skill, page-level Markdown exports, OpenAPI, SDK docs, and retrieved agreement records.

## Reporting

When routing is the result, state the destination and why. When work is performed, return a concise evidence receipt with what completed, relevant IDs/statuses when useful, and the next action.
