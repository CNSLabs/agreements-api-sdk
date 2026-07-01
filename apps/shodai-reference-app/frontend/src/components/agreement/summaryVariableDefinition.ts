export interface SummaryVariableDefinition {
  type?: string;
  subType?: string;
  name?: string;
  description?: string;
  validation?: Record<string, unknown>;
}

interface ResolveSummaryVariableDefinitionParams {
  key: string;
  topLevelVariables?: Record<string, unknown> | null;
  inputDataDefinitions?: Record<string, unknown> | null;
}

function asSummaryVariableDefinition(value: unknown): SummaryVariableDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SummaryVariableDefinition;
}

export function resolveSummaryVariableDefinition(
  params: ResolveSummaryVariableDefinitionParams,
): SummaryVariableDefinition | null {
  const { key, topLevelVariables, inputDataDefinitions } = params;

  const topLevelMatch = asSummaryVariableDefinition(topLevelVariables?.[key]);
  if (topLevelMatch) return topLevelMatch;

  return asSummaryVariableDefinition(inputDataDefinitions?.[key]);
}
