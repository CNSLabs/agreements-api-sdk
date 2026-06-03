import type { AvailableTemplateAccessResponse } from "../hooks/useAgreementsApi.ts";

export function getInitialShowDefaultTemplates(
  templateAccess: AvailableTemplateAccessResponse,
): boolean {
  return templateAccess.defaultTemplateIds.length > 0 || templateAccess.whitelistedTemplateIds.length > 0;
}
