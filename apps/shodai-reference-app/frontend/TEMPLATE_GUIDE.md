# Adding a New Template

This guide explains how to add a new agreement template to the application.

## Quick Steps

1. **Add your template JSON file** to the reference app catalog directory: `data/agreement-templates/`
2. **Run the PDF generation script** from `frontend` to create preview assets
```bash
pnpm generate-template-pdfs
```

The backend serves templates from `data/agreement-templates`, and the frontend fetches them at runtime from the reference app backend API. Regenerate preview assets after changing catalog files so Create page cards have matching PDF/thumbnail links.
