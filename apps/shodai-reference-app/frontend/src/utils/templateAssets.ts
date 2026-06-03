export function templateAssetSlug(templateId: string): string {
  // Stable, filesystem-safe slug for template assets (pdf/png).
  // Example: did:template:mou-v1 -> did-template-mou-v1
  return String(templateId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function templateThumbUrl(templateId: string): string {
  const base = (import.meta as any)?.env?.BASE_URL ?? "/";
  const normalizedBase = base === "/" ? "/agreements/" : String(base).replace(/\/?$/, "/");
  return `${normalizedBase}template-assets/${templateAssetSlug(templateId)}.png`;
}
