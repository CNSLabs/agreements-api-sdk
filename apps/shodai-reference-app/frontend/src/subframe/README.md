# src/subframe — Subframe Design System (DO NOT EDIT MANUALLY)

This folder is **automatically managed by the Subframe sync tool**.

Running `npx @subframe/cli@latest sync --all -p <projectId>` will overwrite files here. Any manual edits will be lost on the next sync.

## What lives here

- `components/` — primitive UI components (Button, Switch, Table, Badge, Select, etc.)
- `layouts/` — full-page layout shells (DefaultPageLayout, DrawerLayout, etc.)
- `index.ts` — barrel export of all components
- `utils.ts` — shared Subframe utility helpers
- `theme.css` — design tokens (colors, typography, spacing)

## Import alias

All components are imported via `@/subframe`:

```ts
import { Button } from "@/subframe/components/Button";
import { Switch } from "@/subframe/components/Switch";
// or via the barrel:
import { Button, Switch, Table } from "@/subframe";
```

## To update components

Run Subframe sync from the frontend directory:

```bash
cd frontend/agreements-frontend
npx @subframe/cli@latest sync --all -p <projectId>
```

Do not add custom logic or app-specific state to files in this folder.
If a primitive needs app-specific behaviour, wrap it in `src/components/` instead.

## Exception: opting a file out of sync

If a file genuinely needs a manual edit that can't be achieved by wrapping, add this as the **first line**:

```ts
// @subframe/sync-disable
```

Subframe will skip that file on the next `npx subframe sync`. Use sparingly, and leave a comment explaining why.
