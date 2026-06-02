# src/components — App Components

This folder contains all **custom, app-specific components** for the agreements frontend.
These are hand-written and owned by this repository — edit freely.

## Structure

```
components/
  agreement/          # Tabs and panels for the Agreement detail page
  document/           # Tabs and panels for the Document (draft) detail page
  *.tsx               # Shared components used across multiple pages
```

## Key components

| File | Purpose |
|---|---|
| `agreement/AgreementActionsTab.tsx` | The "take action" panel on a deployed agreement |
| `agreement/AgreementActivityTab.tsx` | Activity feed for a deployed agreement |
| `agreement/AgreementOverviewTab.tsx` | Overview/summary panel |
| `document/DocumentConfigureTab.tsx` | Variable configuration for a draft agreement |
| `MarkdownRenderer.tsx` | Lightweight read-only markdown display |
| `MarkdownDocumentView.tsx` | Interactive document view with variable inputs |
| `spinner.tsx` | Loading spinner primitive |
| `theme-provider.tsx` | Dark/light theme context provider |

## How to build new components

1. Use primitives from `@/subframe` (Button, Switch, Table, etc.) — do not copy-paste Subframe code.
2. Follow the patterns in existing components in this folder.
3. Keep app logic (API calls, hooks) in `src/hooks/` — components should receive data via props.
4. For new full-page views, add a route file in `src/routes/` and register it in `src/Router.tsx`.

## What does NOT belong here

- Subframe design system primitives → those live in `src/subframe/` (auto-synced, do not edit)
- Utility helpers → `src/utils/`
- Page-level route components → `src/routes/`
